#!/usr/bin/env bun
/**
 * Gate: refresh and logout have a rate-limit bucket of their own, apart from the per-IP login
 * bucket (`.aidd/features/audit-logic-1790885878-token-refresh-counts-against-the-10-per-15-minute-per-ip-brute-force-bucket-and-`).
 *
 * The defect: every non-GET /api/v1/auth/ request counted against one auth:<ip> bucket, ten per
 * fifteen minutes by default. A burst of failed logins from one address, or eleven people behind
 * one NAT, left that address's next refresh answered 429, which the browser treats as a signed-out
 * session. Runs the real application in process against a throwaway temp-file database, with auth
 * rate limiting on and every request from the same address:
 *  1. A burst of failed logins is refused as rate limited before it ends.
 *  2. Straight after it, a signed-in user's refresh from the same address still succeeds.
 *  3. A refresh with no valid token is not answered 429 by the exhausted login bucket either; it
 *     counts against the per-IP session bucket and is refused as unauthenticated (401).
 *  4. The session bucket still limits: enough refreshes without a valid token are answered 429.
 *     A valid user's refresh is keyed by its verified user, so that exhausted per-IP session
 *     bucket does not stop it.
 */
import { resolve } from 'node:path';
import { exit } from 'node:process';

import { getConfig } from '../backend/src/config/configLoader.ts';
import { AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS } from '../backend/src/constants/rateLimit.ts';
import { signTokenPair } from '../backend/src/plugins/authTokens.ts';
import {
	newRefreshFamilyId,
	storeRefreshSession,
} from '../backend/src/utils/auth/refreshSessions.ts';
import { type App, post, seedUserId, startFixture } from './lib/auth-ordering-fixture.ts';

const repoRoot = resolve(import.meta.dir, '..');
/** More failed logins than the default allowance of ten. */
const LOGIN_BURST = 14;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** A refresh cookie for a live sign-in of the given seed user. */
function signedIn(userId: number): string {
	const familyId = newRefreshFamilyId();
	const { refreshToken } = signTokenPair({ id: userId, role: 'OPERATOR', sid: familyId });
	storeRefreshSession(userId, familyId, refreshToken);
	return refreshToken;
}

/** Let the audit plugin's onAfterResponse write land while the database is still open. */
async function settle(): Promise<void> {
	await new Promise((settled) => setTimeout(settled, 0));
}

async function refresh(app: App, refreshToken?: string): Promise<Response> {
	const config = getConfig();
	const headers: Record<string, string> = { origin: config.server.frontendUrl };
	if (refreshToken) headers.cookie = `${config.security.refreshCookieName}=${refreshToken}`;
	const res = await app.handle(
		new Request('http://localhost/api/v1/auth/refresh', { headers, method: 'POST' }),
	);
	await settle();
	return res;
}

async function run(app: App): Promise<void> {
	const userId = seedUserId('OPERATOR');

	// 1. Exhaust the login bucket.
	let lastLogin = 0;
	for (let attempt = 0; attempt < LOGIN_BURST; attempt += 1) {
		const res = await post(app, '/api/v1/auth/login', {
			password: 'definitely-wrong-password',
			username: 'no-such-user',
		});
		await settle();
		lastLogin = res.status;
	}
	assert(
		lastLogin === 429,
		`1: the login burst should end rate limited, got ${String(lastLogin)}`,
	);

	// 2. A live sign-in still refreshes from the same address.
	const first = await refresh(app, signedIn(userId));
	assert(first.status === 200, `2: a valid refresh should succeed, got ${String(first.status)}`);

	// 3. No valid token: refused as unauthenticated, not by the login bucket.
	const anonymous = await refresh(app);
	assert(
		anonymous.status === 401,
		`3: a tokenless refresh should be 401, not limited, got ${String(anonymous.status)}`,
	);

	// 4. The per-IP session bucket limits on its own; a verified user is keyed apart from it.
	let tokenless = 0;
	for (let attempt = 0; attempt <= AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
		tokenless = (await refresh(app, 'not-a-valid-token')).status;
	}
	assert(tokenless === 429, `4: the session bucket should limit, got ${String(tokenless)}`);
	const second = await refresh(app, signedIn(userId));
	assert(
		second.status === 200,
		`4: a verified user's refresh should not share the per-IP session bucket, got ${String(second.status)}`,
	);
}

const { app, dispose } = await startFixture(repoRoot);
try {
	// The fixture starts with auth limiting off; this gate is about what it does when on.
	getConfig().rateLimit.authEnabled = true;
	await run(app);
} finally {
	await dispose();
}

if (failures.length > 0) {
	console.error(`auth session rate limit: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log('auth session rate limit: all checks passed');
