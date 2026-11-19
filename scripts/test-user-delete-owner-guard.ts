#!/usr/bin/env bun
/**
 * Gate: deleting a user who owns an active workspace is refused on both delete paths with an
 * explanation, and the bulk paths evict the user cache (`.aidd/features/
 * user-delete-workspace-owner-guard`).
 *
 * Runs the real application against a throwaway temp-file SQLite database, as an ADMIN.
 *  1. DELETE /users/:id for a workspace owner answers 409 RESOURCE_PROTECTED with a message that
 *     says to delete the workspaces first, and the user stays active. Once the workspace is
 *     deleted, the same request answers 200.
 *  2. POST /users/bulk-delete with an owner and a non-owner fails the owner's item with the same
 *     message and deletes only the non-owner.
 *  3. Bulk delete evicts the cache: a user looked up (and so cached) just before is not returned
 *     afterwards.
 *  4. Bulk role change evicts the cache: a cached VIEWER reads as OPERATOR straight afterwards.
 */
import { resolve } from 'node:path';
import { exit } from 'node:process';

import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';
import { createUser, getUserById } from '../backend/src/services/userService.ts';
import { create as createWorkspace, softDelete } from '../backend/src/services/workspaceService.ts';
import {
	type App,
	type Claim,
	del,
	post,
	put,
	seedUserId,
	startFixture,
} from './lib/auth-ordering-fixture.ts';

const repoRoot = resolve(import.meta.dir, '..');
const PASSWORD = 'Owner-Guard-Probe-1!';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** Let the audit plugin's onAfterResponse write land while the database is still open. */
async function settle(): Promise<void> {
	await new Promise((settled) => setTimeout(settled, 0));
}

async function makeUser(name: string): Promise<number> {
	const user = await createUser({
		email: `${name}@example.test`,
		password: PASSWORD,
		role: 'VIEWER',
		username: name,
	});
	return user.id;
}

async function singleDelete(app: App, admin: Claim): Promise<void> {
	const owner = await makeUser('owner-single');
	const workspace = createWorkspace({ name: 'Owned', ownerId: owner, slug: 'owned-single' });

	const refused = await del(
		app,
		`/api/v1/users/${String(owner)}`,
		admin,
		await generateAndStoreCsrfToken(admin.id),
	);
	await settle();
	const body = (await refused.json()) as { code?: string; message?: string };
	assert(refused.status === 409, `1: deleting an owner should answer 409, got ${refused.status}`);
	assert(
		body.code === 'RESOURCE_PROTECTED',
		`1: the code should be RESOURCE_PROTECTED, got ${body.code}`,
	);
	assert(
		body.message?.includes('Delete those workspaces') === true,
		`1: the message should say to delete the workspaces first, got ${body.message}`,
	);
	assert(getUserById(owner) !== null, '1: a refused owner should stay active');

	assert(softDelete(workspace.id, admin.id), '1: deleting the owned workspace should succeed');
	const allowed = await del(
		app,
		`/api/v1/users/${String(owner)}`,
		admin,
		await generateAndStoreCsrfToken(admin.id),
	);
	await settle();
	assert(
		allowed.status === 200,
		`1: once unowned, the delete should answer 200, got ${allowed.status}`,
	);
}

async function bulkDelete(app: App, admin: Claim): Promise<void> {
	const owner = await makeUser('owner-bulk');
	const plain = await makeUser('plain-bulk');
	createWorkspace({ name: 'Owned bulk', ownerId: owner, slug: 'owned-bulk' });
	assert(getUserById(plain)?.id === plain, '3: the non-owner should be cached before the delete');

	const response = await post(
		app,
		'/api/v1/users/bulk-delete',
		{ ids: [owner, plain] },
		admin,
		await generateAndStoreCsrfToken(admin.id),
	);
	await settle();
	const body = (await response.json()) as {
		data?: { results?: { error?: string; id: number; success: boolean }[] };
	};
	assert(response.status === 200, `2: bulk delete should answer 200, got ${response.status}`);
	checkBulkItems(body.data?.results ?? [], owner, plain);
	assert(getUserById(owner) !== null, '2: the owner should stay active');
	assert(getUserById(plain) === null, '3: a bulk-deleted user should not be served from cache');
}

function checkBulkItems(
	results: { error?: string; id: number; success: boolean }[],
	owner: number,
	plain: number,
): void {
	const ownerResult = results.find((r) => r.id === owner);
	const plainResult = results.find((r) => r.id === plain);
	assert(ownerResult?.success === false, "2: the owner's item should fail");
	assert(
		ownerResult?.error?.includes('Delete those workspaces') === true,
		`2: the owner's item should carry the owner message, got ${ownerResult?.error}`,
	);
	assert(plainResult?.success === true, "2: the non-owner's item should succeed");
}

async function bulkRoles(app: App, admin: Claim): Promise<void> {
	const target = await makeUser('role-bulk');
	assert(getUserById(target)?.role === 'VIEWER', '4: the target should be cached as VIEWER');
	const response = await put(
		app,
		'/api/v1/users/bulk/roles',
		{ updates: [{ id: target, role: 'OPERATOR' }] },
		admin,
		await generateAndStoreCsrfToken(admin.id),
	);
	await settle();
	assert(
		response.status === 200,
		`4: bulk role change should answer 200, got ${response.status}`,
	);
	assert(
		getUserById(target)?.role === 'OPERATOR',
		`4: the new role should show at once, got ${getUserById(target)?.role}`,
	);
}

const { app, dispose } = await startFixture(repoRoot);
try {
	const admin: Claim = { id: seedUserId('ADMIN'), role: 'ADMIN' };
	await singleDelete(app, admin);
	await bulkDelete(app, admin);
	await bulkRoles(app, admin);
} finally {
	await dispose();
}

if (failures.length > 0) {
	console.error(`user delete owner guard: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log('user delete owner guard: all checks passed');
