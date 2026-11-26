#!/usr/bin/env bun
/**
 * Gate: an established WebSocket closes once the access token it was opened with is revoked on
 * its own, as a logout does, and not only on account-wide revocation
 * (audit-security-1792503686-logout-does-not-revoke-an-already-open-websocket-authenticated-with-that-token).
 *
 * The defect: logout blacklists the one access token, but an open socket kept only that token's
 * timestamps and revalidated against account-wide revocation, so a socket opened with a copied
 * token kept receiving the user's notifications after the logout, until the token expired.
 *
 * Runs in-process against a throwaway temp-file SQLite database. The socket contexts come from the
 * real handleUpgrade, and the logout is the real POST /auth/logout through app.handle(), so the
 * revocation is the one production writes. It checks:
 *  1. the upgrade keeps the token's hash, never the raw token;
 *  2. both of the user's sockets are valid before anything is revoked;
 *  3. after browser A logs out, A's socket closes with "Token revoked" on the next full check;
 *  4. browser B, with its own token, keeps its socket;
 *  5. an account-wide revocation still closes browser B's socket.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { getAppSlug, loadDefaults } from '../backend/src/config/configUtils.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { signAccessToken } from '../backend/src/plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';
import { type WsContext } from '../backend/src/routes/ws/wsAuth.ts';
import { handleUpgrade } from '../backend/src/routes/ws/wsHandlers.ts';
import { revalidateConnection } from '../backend/src/routes/ws/wsRevalidation.ts';
import { revokeAllUserTokens } from '../backend/src/utils/auth/tokenBlacklist.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

const repoRoot = resolve(import.meta.dir, '..');
const USER_ID = 7;
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

const closes: string[] = [];
const socket = { close: (_code?: number, reason?: string): void => void closes.push(reason ?? '') };

// A throwaway config directory, created from defaults, and the app's slug-prefixed environment
// overrides dropped, so neither the checkout's config nor the environment can change the result
// behind the step's cache key (as scripts/test-ws-revalidation-ceiling.ts does).
const envPrefix = `${getAppSlug(loadDefaults()).toUpperCase().replace(/-/g, '_')}_`;
for (const name of Object.keys(process.env)) {
	if (name.toUpperCase().startsWith(envPrefix)) delete process.env[name];
}
const configDir = mkdtempSync(join(tmpdir(), 'spernakit-ws-revocation-config-'));
try {
	initializeConfig(configDir);
} finally {
	rmSync(configDir, { force: true, recursive: true });
}
const config = getConfig();
applyEphemeralAuthKeys(config.security);
config.rateLimit.enabled = false;
// The logout's audit row is written after the response settles; this gate is about sockets, so
// it turns auditing off rather than racing the hook against closeDatabase.
config.audit.enabled = false;
const cookieName = config.security.authCookieName;
const origin = config.server.frontendUrl;

/** Open a socket context through the real upgrade handler, as the browser holding `token` would. */
function upgrade(token: string): WsContext {
	const set: { status?: number | string } = {};
	const result = handleUpgrade({
		request: new Request('http://localhost/ws', {
			headers: { cookie: `${cookieName}=${token}`, origin },
		}),
		set,
	});
	if (typeof result === 'string')
		throw new Error(`upgrade refused: ${result} (${String(set.status)})`);
	return result as unknown as WsContext;
}

const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-ws-revocation-'));
try {
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	getDb()
		.insert(users)
		.values({
			email: 'ws@example.com',
			id: USER_ID,
			passwordHash: 'x',
			role: 'OPERATOR',
			username: 'ws',
		})
		.run();
	const app = createApiApp();

	// 1. Two browsers, each with its own token; the upgrade keeps only each token's hash.
	const tokenA = signAccessToken({ id: USER_ID, role: 'OPERATOR' });
	const tokenB = signAccessToken({ id: USER_ID, role: 'OPERATOR' });
	assert(tokenA !== tokenB, 'the two browsers hold different tokens');
	const socketA = upgrade(tokenA);
	const socketB = upgrade(tokenB);
	assert(
		typeof socketA.accessTokenHash === 'string' && socketA.accessTokenHash.length === 64,
		'the upgrade keeps the token hash',
	);
	assert(
		socketA.accessTokenHash !== socketB.accessTokenHash,
		"each socket keeps its own token's hash",
	);
	assert(
		!JSON.stringify(socketA).includes(tokenA),
		'the socket context does not keep the raw access token',
	);

	// 2. Nothing revoked yet: both sockets pass a full check.
	assert(
		revalidateConnection(socket, socketA, true),
		"browser A's socket is valid before logout",
	);
	assert(
		revalidateConnection(socket, socketB, true),
		"browser B's socket is valid before logout",
	);

	// 3. Browser A logs out through the real route, which revokes that one token.
	const csrf = (await generateAndStoreCsrfToken(USER_ID)) ?? '';
	const loggedOut = await app.handle(
		new Request('http://localhost/api/v1/auth/logout', {
			headers: { cookie: `${cookieName}=${tokenA}`, origin, 'X-CSRF-Token': csrf },
			method: 'POST',
		}),
	);
	assert(loggedOut.status === 200, `logout must succeed, got ${String(loggedOut.status)}`);
	assert(
		!revalidateConnection(socket, socketA, true),
		"after A's logout, the socket opened with A's token closes on the next full check",
	);
	assert(
		closes.at(-1) === 'Token revoked',
		`the close names the revoked token, got ${String(closes.at(-1))}`,
	);

	// 4. Browser B's own token was not revoked, so its socket stays open.
	assert(revalidateConnection(socket, socketB, true), "browser B's socket survives A's logout");

	// 5. An account-wide revocation (a password change) still closes every socket.
	revokeAllUserTokens(USER_ID, new Date(Date.now() + 3_600_000));
	assert(
		!revalidateConnection(socket, socketB, true),
		'an account-wide revocation closes the remaining socket',
	);
} finally {
	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
	}
}

if (failures.length > 0) {
	console.error(`websocket token revocation: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('websocket token revocation: all checks passed');
