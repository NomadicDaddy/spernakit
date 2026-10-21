#!/usr/bin/env bun
/**
 * Regression gate for the v2 API-key signing scheme and the password-reset consumption race
 * (both fixed in v3.47.6 after the 2026-10-20 SECURITY audit; Morticia #16912 asked for a
 * test per scheme and a non-revealing race failure; the 2026-10-20 shadow reviews demanded
 * real concurrency, a negative control and a post-claim failure probe).
 *
 * Signing: v2 signs timestamp\nnonce\nmethod\npath\nbody. The assertions prove, against a
 * throwaway database, that (1) a correct v2 signature validates, (2) the same nonce cannot be
 * reused (uniqueness), (3) a signature replayed under a DIFFERENT nonce fails the HMAC
 * comparison (the nonce is signed - the fix), (4) a v1 signature over a fresh, unconsumed
 * nonce is rejected outright (the version gate, not nonce exhaustion: no acceptance window,
 * no client-side signer ships anywhere to grandfather), and (5) a nonce outside
 * [A-Za-z0-9-]{16,128} is refused, so no crafted nonce can shift the payload's newline field
 * boundaries.
 *
 * Race: two resets with the same live token run CONCURRENTLY (Promise.all). Both clear the
 * pre-transaction SELECT (password-history and hashing are awaited first), so both reach the
 * consuming UPDATE and exactly one may win. A negative control runs the pre-fix id-only
 * update predicate twice and shows both claims match - demonstrating what the guarded
 * version must prevent. A post-claim failure is injected into the transaction and must
 * report failure with the token and password hash untouched (no rolled-back "success").
 */
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
// eq comes through the DB surface module: this script resolves dependencies from the root
// manifest, which does not carry drizzle-orm.
import { closeDatabase, eq, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { validateSignature } from '../backend/src/services/apiKeySignatureService.ts';
import { resetPassword } from '../backend/src/services/auth/authPasswordReset.ts';
import { consumeResetToken } from '../backend/src/services/auth/authPasswordResetConsume.ts';
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

	// v1 over a FRESH nonce: proves the version gate refuses v1 itself, not that the nonce
	// happened to be spent.
	const v1Nonce = randomBytes(16).toString('hex');
	const v1Payload = `${timestamp}\n${method}\n${path}\n${body}`;
	const v1Signature = createHmac('sha256', keySecret).update(v1Payload).digest('hex');
	const v1Accepted = validateSignature(
		{ body, method, nonce: v1Nonce, path, signature: v1Signature, timestamp, version: 1 },
		keySecret,
	);
	if (v1Accepted) failures.push('a v1 signature must be rejected outright');

	// An otherwise-VALID v2 signature (fresh nonce, correct payload) submitted as version 1
	// must also be refused: with the version gate removed this request would pass the HMAC
	// and succeed, so this case is what actually detects the gate's removal - the legacy
	// payload above could never pass the v2 HMAC and would mask exactly that regression.
	const v1GateNonce = randomBytes(16).toString('hex');
	const v2ValidSignature = createHmac('sha256', keySecret)
		.update(`${timestamp}\n${v1GateNonce}\n${method}\n${path}\n${body}`)
		.digest('hex');
	const validV2AsV1 = validateSignature(
		{
			body,
			method,
			nonce: v1GateNonce,
			path,
			signature: v2ValidSignature,
			timestamp,
			version: 1,
		},
		keySecret,
	);
	if (validV2AsV1) {
		failures.push('a valid v2 signature submitted as version 1 must be refused (version gate)');
	}

	const boundaryNonce = `x${'\nGET\n/other\n'}${randomBytes(8).toString('hex')}`;
	const boundaryShift = validateSignature(
		{
			body,
			method,
			nonce: boundaryNonce,
			path,
			signature: createHmac('sha256', keySecret)
				.update(`${timestamp}\n${boundaryNonce}\n${method}\n${path}\n${body}`)
				.digest('hex'),
			timestamp,
			version: 2,
		},
		keySecret,
	);
	if (boundaryShift) {
		failures.push('a newline-bearing nonce must be refused (field-boundary shift replay)');
	}

	// ---------- Reset consumption race: concurrent ----------
	const raceToken = randomBytes(32).toString('hex');
	const raceTokenHash = createHash('sha256').update(raceToken).digest('hex');
	getDb()
		.insert(users)
		.values({
			email: 'race@fixture.invalid',
			passwordHash: 'not-a-real-hash',
			resetToken: raceTokenHash,
			resetTokenExpiresAt: new Date(Date.now() + 60_000),
			role: 'OPERATOR',
			username: 'racefixture',
		})
		.run();

	// Both calls clear the SELECT before either UPDATE: isPasswordInHistory and hashPassword
	// are awaited inside resetPassword, so the Promise.all pair is genuinely in flight
	// together at the claim. Exactly one may win; the loser must see the bare invalid-token
	// shape so the race never reveals the winner.
	const racers = await Promise.all([
		resetPassword(raceToken, 'NewPassword1!a'),
		resetPassword(raceToken, 'DifferentPassword2!b'),
	]);
	const successes = racers.filter((result) => result.success).length;
	if (successes !== 1) {
		failures.push(`exactly one concurrent reset must win, saw ${successes} successes`);
	}
	const loser = racers.find((result) => !result.success);
	if (loser && ('reason' in loser || loser.success !== false)) {
		failures.push('the losing concurrent reset must fail with the bare invalid-token shape');
	}
	const raceRow = getDb()
		.select()
		.from(users)
		.where(eq(users.email, 'race@fixture.invalid'))
		.get();
	if (raceRow && raceRow.resetToken !== null) {
		failures.push('the winning concurrent reset must clear the token it consumed');
	}
	if (raceRow && raceRow.passwordHash === 'not-a-real-hash') {
		failures.push('the winning concurrent reset must persist its password write');
	}

	const secondRound = await resetPassword(raceToken, 'ThirdAttempt3!c');
	if (secondRound.success !== false || 'reason' in secondRound) {
		failures.push('a spent token must keep failing with the bare shape');
	}
	const bogus = await resetPassword('never-existed', 'Whatever4!d');
	if (bogus.success !== false || 'reason' in bogus) {
		failures.push('an invalid token must fail with the bare shape');
	}

	// ---------- Negative control: the pre-fix id-only predicate ----------
	// Seeds a second live token and claims it twice with the OLD where(eq(users.id)) form.
	// Both claims match one row, which is exactly the double-consumption the guarded
	// predicate above must prevent - so the concurrency assertion has teeth.
	const controlTokenHash = createHash('sha256')
		.update(randomBytes(32).toString('hex'))
		.digest('hex');
	getDb()
		.insert(users)
		.values({
			email: 'control@fixture.invalid',
			passwordHash: 'control-old-hash',
			resetToken: controlTokenHash,
			resetTokenExpiresAt: new Date(Date.now() + 60_000),
			role: 'OPERATOR',
			username: 'controlfixture',
		})
		.run();
	const controlUser = getDb()
		.select()
		.from(users)
		.where(eq(users.email, 'control@fixture.invalid'))
		.get();
	if (!controlUser) {
		failures.push('negative control fixture user must exist');
	} else {
		const claimOldWay = (hash: string) =>
			getDb()
				.update(users)
				.set({ passwordHash: hash, resetToken: null, resetTokenExpiresAt: null })
				.where(eq(users.id, controlUser.id))
				.returning({ id: users.id })
				.all().length;
		const firstOldClaim = claimOldWay('control-first-write');
		const secondOldClaim = claimOldWay('control-second-write');
		if (firstOldClaim !== 1 || secondOldClaim !== 1) {
			failures.push(
				'negative control broken: the id-only predicate must let both claims match (got ' +
					`${firstOldClaim}/${secondOldClaim})`,
			);
		}
	}

	// ---------- Post-claim failure cannot report success ----------
	const claimToken = randomBytes(32).toString('hex');
	const claimTokenHash = createHash('sha256').update(claimToken).digest('hex');
	getDb()
		.insert(users)
		.values({
			email: 'claim@fixture.invalid',
			passwordHash: 'claim-old-hash',
			resetToken: claimTokenHash,
			resetTokenExpiresAt: new Date(Date.now() + 60_000),
			role: 'OPERATOR',
			username: 'claimfixture',
		})
		.run();
	const claimUser = getDb()
		.select()
		.from(users)
		.where(eq(users.email, 'claim@fixture.invalid'))
		.get();
	if (!claimUser) {
		failures.push('post-claim fixture user must exist');
	} else {
		const injected = consumeResetToken(claimUser, claimTokenHash, 'claim-new-hash', () => {
			throw new Error('injected post-claim failure');
		});
		if (injected) failures.push('a post-claim failure must not report the claim as consumed');
		const afterInjection = getDb()
			.select()
			.from(users)
			.where(eq(users.email, 'claim@fixture.invalid'))
			.get();
		if (afterInjection && afterInjection.resetToken !== claimTokenHash) {
			failures.push('a rolled-back claim must leave the reset token consumable again');
		}
		if (afterInjection && afterInjection.passwordHash !== 'claim-old-hash') {
			failures.push('a rolled-back claim must leave the old password hash in place');
		}
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
	'[OK] security fixes: v2 signed nonce validates, replay, reuse, v1 and boundary-shifting nonces fail; exactly one concurrent reset wins (id-only control shows why); a post-claim failure rolls back and reports failure.',
);
