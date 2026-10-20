#!/usr/bin/env bun
/**
 * Regression gate for the v2 API-key signing scheme and the password-reset consumption race
 * (both fixed in v3.47.6 after the 2026-10-20 SECURITY audit; Morticia #16912 asked for a
 * test per scheme and a non-revealing race failure).
 *
 * Signing: v2 signs timestamp\nnonce\nmethod\npath\nbody. The assertions prove, against a
 * throwaway database, that (1) a correct v2 signature validates, (2) the same nonce cannot be
 * reused (uniqueness), (3) a signature replayed under a DIFFERENT nonce fails the HMAC
 * comparison (the nonce is signed - the fix), (4) a v1-shaped payload with version 1 is
 * rejected outright (no acceptance window: no client-side signer ships anywhere to grandfather).
 * Race: the consuming reset UPDATE re-asserts the token; the test seeds a user with a real
 * reset token, consumes it once, then proves a second reset with the same token fails with the
 * same bare { success: false } shape as an invalid token.
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { validateSignature } from '../backend/src/services/apiKeySignatureService.ts';
import { resetPassword } from '../backend/src/services/auth/authPasswordReset.ts';
import { applyEphemeralAuthKeys } from './lib/test-auth-keys.ts';

const repoRoot = join(import.meta.dir, '..');
const failures: string[] = [];

initializeConfig();
const config = getConfig();
applyEphemeralAuthKeys(config.security);
config.rateLimit.enabled = false;
config.rateLimit.authEnabled = false;

const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-security-fixes-'));
try {
	runAutoMigrations(join(tmpDir, 'test.db'), join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(join(tmpDir, 'test.db'));

	// ---------- Signing scheme ----------
	const keySecret = randomBytes(32).toString('hex');
	const timestamp = Math.floor(Date.now() / 1000);
	const method = 'GET';
	const path = '/api/v1/audit-logs';
	const body = '';
	const nonce = randomBytes(16).toString('hex');
	const v2Payload = `${timestamp}\n${nonce}\n${method}\n${path}\n${body}`;
	const v2Signature = createHmac('sha256', keySecret).update(v2Payload).digest('hex');
	const base = { body, method, nonce, path, timestamp };

	const fresh = validateSignature({ ...base, signature: v2Signature, version: 2 }, keySecret);
	if (!fresh) failures.push('a correct v2 signature must validate');

	const sameNonce = validateSignature({ ...base, signature: v2Signature, version: 2 }, keySecret);
	if (sameNonce) failures.push('the same nonce must not validate twice (uniqueness)');

	const otherNonce = randomBytes(16).toString('hex');
	const replayed = validateSignature(
		{ ...base, nonce: otherNonce, signature: v2Signature, version: 2 },
		keySecret,
	);
	if (replayed) {
		failures.push(
			'a captured signature replayed under a different nonce must fail (nonce is signed)',
		);
	}

	const v1Payload = `${timestamp}\n${method}\n${path}\n${body}`;
	const v1Signature = createHmac('sha256', keySecret).update(v1Payload).digest('hex');
	const v1Accepted = validateSignature(
		{ body, method, nonce, path, signature: v1Signature, timestamp, version: 1 },
		keySecret,
	);
	if (v1Accepted) failures.push('a v1 signature must be rejected outright');

	// ---------- Reset consumption race ----------
	const token = randomBytes(32).toString('hex');
	const tokenHash = createHash('sha256').update(token).digest('hex');
	getDb()
		.insert(users)
		.values({
			email: 'race@fixture.invalid',
			passwordHash: 'not-a-real-hash',
			resetToken: tokenHash,
			resetTokenExpiresAt: new Date(Date.now() + 60_000),
			role: 'OPERATOR',
			username: 'racefixture',
		})
		.run();

	const winner = await resetPassword(token, 'NewPassword1!a');
	if (!winner.success) failures.push('the first reset with a live token must succeed');

	const loser = await resetPassword(token, 'DifferentPassword2!b');
	if (loser.success !== false || 'reason' in loser) {
		failures.push('the second reset with the consumed token must fail like an invalid token');
	}
	const bogus = await resetPassword('never-existed', 'Whatever3!c');
	if (bogus.success !== false || 'reason' in bogus) {
		failures.push('an invalid token must fail with the bare shape');
	}
} finally {
	closeDatabase();
	try {
		rmSync(tmpDir, { force: true, recursive: true });
	} catch {
		// Windows can hold the sqlite file handle briefly after close; the OS temp cleaner
		// owns the directory from here.
	}
}

if (failures.length > 0) {
	console.error('[FAIL] security fixes:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	'[OK] security fixes: v2 signed nonce validates, replay and reuse fail, v1 rejected, reset race fails closed.',
);
