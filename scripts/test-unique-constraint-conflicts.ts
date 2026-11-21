#!/usr/bin/env bun
/**
 * Gate: uniqueness pre-checks judge the same rows as the unique index behind them, so a collision
 * answers 409 and never escapes as a 500 (`.aidd/features/unique-constraint-500`).
 *
 * Runs the real application against a throwaway temp-file SQLite database.
 *  1. API keys: a revoked key's name can be used again (idx_api_keys_user_key_name is partial on
 *     active rows). An active duplicate still answers 409, and the index itself still refuses an
 *     active duplicate that bypasses the route's pre-check.
 *  2. Users: renaming a user to a soft-deleted account's username, or giving them its email,
 *     answers 409. A fresh value is the positive control.
 *  3. check-username answers "taken" for a soft-deleted account's username, matching the index.
 *  4. Email change: requesting a soft-deleted account's address is refused as taken, and
 *     confirming a token for one answers 409 and consumes the token rather than leaving it live.
 */
import { createHash, randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { exit } from 'node:process';

import { getDb } from '../backend/src/db/index.ts';
import { emailChangeTokens } from '../backend/src/db/schema/emailChangeTokens.ts';
import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';
import { generateApiKey, revokeApiKey } from '../backend/src/services/apiKeyService.ts';
import { requestEmailChange } from '../backend/src/services/authService.ts';
import { createUser, softDeleteUser } from '../backend/src/services/userService.ts';
import { type App, type Claim, get, post, put, startFixture } from './lib/auth-ordering-fixture.ts';
import { seedUserId } from './lib/temp-db-app.ts';

const repoRoot = resolve(import.meta.dir, '..');
const PASSWORD = 'Unique-Probe-1!';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** Let the audit plugin's onAfterResponse write land while the database is still open. */
async function settle(): Promise<void> {
	await new Promise((settled) => setTimeout(settled, 0));
}

async function signedPost(app: App, path: string, body: unknown, claim: Claim): Promise<Response> {
	const response = await post(app, path, body, claim, await generateAndStoreCsrfToken(claim.id));
	await settle();
	return response;
}

async function signedPut(app: App, path: string, body: unknown, claim: Claim): Promise<Response> {
	const response = await put(app, path, body, claim, await generateAndStoreCsrfToken(claim.id));
	await settle();
	return response;
}

async function apiKeyCases(app: App, admin: Claim): Promise<void> {
	const path = `/api/v1/users/${String(admin.id)}/api-keys`;
	const first = await signedPost(app, path, { keyName: 'reuse-me' }, admin);
	assert(first.status === 201, `1: creating a key should answer 201, got ${first.status}`);
	const firstBody = (await first.json()) as { data?: { keyData?: { id?: number } } };
	const firstId = firstBody.data?.keyData?.id;
	assert(typeof firstId === 'number', '1: the created key should report its id');
	if (typeof firstId !== 'number') return;

	const duplicate = await signedPost(app, path, { keyName: 'reuse-me' }, admin);
	assert(
		duplicate.status === 409,
		`1: an active duplicate name should answer 409, got ${duplicate.status}`,
	);

	assert(await revokeApiKey(firstId, admin.id), '1: revoking the first key should succeed');
	const reused = await signedPost(app, path, { keyName: 'reuse-me' }, admin);
	assert(
		reused.status === 201,
		`1: a revoked key's name should be reusable, got ${reused.status}`,
	);

	let indexRefused = false;
	try {
		await generateApiKey({ createdBy: admin.id, keyName: 'reuse-me', keyScope: 'read' });
	} catch (err) {
		indexRefused = err instanceof Error && err.message.includes('UNIQUE constraint failed');
	}
	assert(indexRefused, '1: the index should still refuse a second active key with the same name');
}

async function userCases(app: App, admin: Claim): Promise<void> {
	const ghost = await createUser({
		email: 'ghost@fixture.invalid',
		password: PASSWORD,
		role: 'VIEWER',
		username: 'ghostuser',
	});
	const target = await createUser({
		email: 'target@fixture.invalid',
		password: PASSWORD,
		role: 'VIEWER',
		username: 'targetuser',
	});
	assert(softDeleteUser(ghost.id, admin.id), '2: soft-deleting the ghost account should succeed');
	const path = `/api/v1/users/${String(target.id)}`;

	const takenName = await signedPut(app, path, { username: 'ghostuser' }, admin);
	assert(
		takenName.status === 409,
		`2: a soft-deleted username should answer 409, got ${takenName.status}`,
	);
	const takenEmail = await signedPut(app, path, { email: 'ghost@fixture.invalid' }, admin);
	assert(
		takenEmail.status === 409,
		`2: a soft-deleted email should answer 409, got ${takenEmail.status}`,
	);
	const fresh = await signedPut(app, path, { username: 'freshname' }, admin);
	assert(fresh.status === 200, `2: a fresh username should answer 200, got ${fresh.status}`);

	const viewer: Claim = { id: target.id, role: 'VIEWER' };
	const check = async (name: string): Promise<boolean | undefined> => {
		const response = await get(app, `/api/v1/users/check-username/${name}`, viewer);
		await settle();
		const body = (await response.json()) as { data?: { available?: boolean } };
		return body.data?.available;
	};
	assert(
		(await check('ghostuser')) === false,
		'3: a soft-deleted username should not be available',
	);
	assert((await check('unclaimedname')) === true, '3: an unclaimed username should be available');

	const request = await requestEmailChange(target.id, PASSWORD, 'ghost@fixture.invalid');
	assert(!request.success, "4: requesting a soft-deleted account's address should be refused");

	const token = randomBytes(32).toString('hex');
	getDb()
		.insert(emailChangeTokens)
		.values({
			expiresAt: new Date(Date.now() + 60_000),
			newEmail: 'ghost@fixture.invalid',
			tokenHash: createHash('sha256').update(token).digest('hex'),
			userId: target.id,
		})
		.run();
	const confirm = await post(app, '/api/v1/auth/confirm-email-change', { token });
	await settle();
	assert(
		confirm.status === 409,
		`4: confirming onto a soft-deleted address should answer 409, got ${confirm.status}`,
	);
	const row = getDb()
		.select()
		.from(emailChangeTokens)
		.all()
		.find((t) => t.userId === target.id);
	assert(
		row?.consumedAt instanceof Date,
		'4: the refused token should be consumed, not left live',
	);
}

const { app, dispose } = await startFixture(repoRoot);
try {
	const admin: Claim = { id: seedUserId('ADMIN'), role: 'ADMIN' };
	await apiKeyCases(app, admin);
	await userCases(app, admin);
} finally {
	await dispose();
}

if (failures.length > 0) {
	console.error(`unique constraint conflicts: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log('unique constraint conflicts: all checks passed');
