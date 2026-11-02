#!/usr/bin/env bun
/**
 * Regression gate for mandatory API-key request signing (the residual core of the 2026-10-20
 * SECURITY audit High: `audit-security-1792503686`, spec items 1 and 2, plus the strict timestamp
 * parse the 2026-10-27 review correction asked for).
 *
 * The defect: `resolveApiKeyUser` selected an unsigned path whenever any signature header was
 * missing, and `validateApiKey` accepted a plain string input, so a valid key alone authenticated.
 * `Number.parseInt` on the timestamp header also coerced a missing header to 0 and a malformed one
 * ("2abc"-style) to a prefix value.
 *
 * The assertions drive the REAL application against a throwaway seeded database with a REAL minted
 * key, and prove: (1) a bare key with no signing headers is refused, (2) each signing header
 * removed on its own is refused, (3) an empty-valued header is refused like a missing one,
 * (4) a fully signed request authenticates, (5) a duplicate nonce is refused, (6) a captured
 * signature replayed under a different nonce is refused (nonce-substitution replay), and
 * (7) a malformed timestamp header is refused rather than partially parsed.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';

import type { App } from './lib/auth-ordering-fixture.ts';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { generateApiKey } from '../backend/src/services/apiKeyService.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

const repoRoot = join(import.meta.dir, '..');
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

initializeConfig();
const config = getConfig();
applyEphemeralAuthKeys(config.security);
config.rateLimit.enabled = false;
config.rateLimit.authEnabled = false;

const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-api-key-signing-'));
let app: App | undefined;
try {
	runAutoMigrations(join(tmpDir, 'test.db'), join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(join(tmpDir, 'test.db'));

	// A real owner and a real minted key, so the probes exercise the true mint -> validate path.
	getDb()
		.insert(users)
		.values({
			email: 'signing@fixture.invalid',
			passwordHash: 'not-a-real-hash',
			role: 'ADMIN',
			username: 'signingfixture',
		})
		.run();
	const owner = getDb()
		.select()
		.from(users)
		.all()
		.find((u) => u.username === 'signingfixture');
	if (!owner) throw new Error('signing fixture user must exist');
	const { apiKey, apiKeySecret } = await generateApiKey({
		createdBy: owner.id,
		keyName: 'signing-gate',
		keyScope: 'read',
	});

	const { createApiApp: buildApp } = await import('../backend/src/create-api-app.ts');
	app = buildApp();

	const METHOD = 'GET';
	const PATH = '/api/v1/audit-logs';
	const BODY = '';

	function signedHeaders(overrides: Record<string, string>): Record<string, string> {
		const timestamp = Math.floor(Date.now() / 1000);
		const nonce = randomBytes(16).toString('hex');
		const payload = `${timestamp}\n${nonce}\n${METHOD}\n${PATH}\n${BODY}`;
		const signature = createHmac('sha256', apiKeySecret).update(payload).digest('hex');
		return {
			'x-api-key': apiKey,
			'X-API-Nonce': nonce,
			'X-API-Signature': signature,
			'X-API-Timestamp': String(timestamp),
			'X-API-Version': '2',
			...overrides,
		};
	}

	async function send(headers: Record<string, string>): Promise<Response> {
		if (!app) throw new Error('app not started');
		return app.handle(new Request(`http://localhost${PATH}`, { headers, method: METHOD }));
	}

	// The route floor is ADMIN and the key scope caps at read->VIEWER, so an authenticated key
	// request answers 403 (recognized, under-privileged) while an unauthenticated one answers 401.
	// That separation is what makes each probe's verdict observable.
	const AUTHORIZED = 403;

	// (1) Unsigned: the key alone must never authenticate.
	const unsigned = await send({ 'x-api-key': apiKey });
	assert(
		unsigned.status === 401,
		`a bare API key with no signing headers must be refused (got ${unsigned.status})`,
	);

	// (2) Each signing header removed on its own.
	for (const header of ['X-API-Signature', 'X-API-Timestamp', 'X-API-Nonce', 'X-API-Version']) {
		const { [header]: _removed, ...rest } = signedHeaders({});
		const response = await send(rest);
		assert(
			response.status === 401,
			`removing ${header} alone must refuse the request (got ${response.status})`,
		);
	}

	// (3) An empty value is the same missing header.
	const emptySignature = await send(signedHeaders({ 'X-API-Signature': '' }));
	assert(
		emptySignature.status === 401,
		`an empty X-API-Signature must be refused like a missing one (got ${emptySignature.status})`,
	);

	// (4) A fully signed request authenticates (and lands on the role cap, not on 401).
	const valid = signedHeaders({});
	const signed = await send(valid);
	assert(
		signed.status === AUTHORIZED,
		`a correctly signed request must authenticate (got ${signed.status}, expected ${AUTHORIZED})`,
	);

	// (5) Duplicate nonce: resend the IDENTICAL signed request (same nonce, same signature).
	const replayed = await send({ ...valid });
	assert(replayed.status === 401, `a duplicate nonce must be refused (got ${replayed.status})`);

	// (6) Nonce substitution: the captured signature resent under a DIFFERENT nonce. The nonce is
	// signed, so the HMAC comparison must fail even though the substituted nonce itself is fresh.
	const substituted = await send({
		...valid,
		'X-API-Nonce': randomBytes(16).toString('hex'),
	});
	assert(
		substituted.status === 401,
		`a captured signature replayed under a different nonce must be refused (got ${substituted.status})`,
	);

	// (7) Malformed timestamp: "17abc" must be refused outright, not parsed as 17.
	const malformed = await send(signedHeaders({ 'X-API-Timestamp': '17abc' }));
	assert(
		malformed.status === 401,
		`a malformed X-API-Timestamp must be refused, not partially parsed (got ${malformed.status})`,
	);
} finally {
	await closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows can hold the sqlite file handle briefly after close; the OS temp cleaner
		// owns the directory from here.
	}
}

if (failures.length > 0) {
	console.error('[FAIL] API key request signing:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	'[OK] API key request signing: unsigned, each missing header, empty header, duplicate nonce, ' +
		'nonce substitution and malformed timestamp all refused (7 probes); a correctly signed ' +
		'request authenticates.',
);
