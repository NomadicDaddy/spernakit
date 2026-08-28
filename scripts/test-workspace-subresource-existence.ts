/**
 * A workspace sub-resource of a workspace that is not there answers 404.
 *
 * `GET /workspaces/:id/members` used to answer 200 with a member list for a workspace that had been
 * deleted, and the member writes used to succeed against it. Both read as a statement about the
 * workspace when the true answer is that there is no such workspace. Soft-deleting a workspace
 * leaves its membership rows behind, so a member still passed the membership guard for a workspace
 * the query layer had stopped returning, and passing the guard was taken as proof it was there.
 *
 * The claims below are the shape of the fix rather than the fix itself:
 *
 * 1. Every workspace sub-resource route, not only the one this was reported against, answers 404
 *    for an id that does not exist.
 * 2. The access check runs first and the existence check second, so a caller with no access hears
 *    403 for a real workspace and for an absent one and cannot use the status to find out which
 *    ids exist.
 * 3. An existing workspace answers exactly as it did, including one whose member list is
 *    legitimately empty, which is a different answer from a workspace that is not there.
 * 4. A soft-deleted workspace answers the way the sibling route already answers for one, to a
 *    member of it as well as to a SYSOP, and its member writes no longer succeed.
 * 5. The check has one owner. Every route naming a workspace in its path reaches a guard, and no
 *    route under `routes/` asks whether a workspace exists itself, so a route added later cannot
 *    answer for a deleted workspace by forgetting a line.
 *
 * Run: `bun run test:workspace-subresource-existence`
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	existenceChecksOutsideTheGuards,
	routesSkippingTheGuard,
	scopedRouteCount,
} from './lib/workspace-subresource-scan.ts';
import {
	ABSENT_WORKSPACE,
	type Actor,
	type App,
	call,
	listed,
	startWorld,
	type World,
} from './lib/workspace-subresource-world.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];

/** Record a claim that did not hold. Every claim is checked; the run reports all of them at once. */
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** One sub-resource request, described the way the gate wants to talk about it. */
interface SubResource {
	body?: unknown;
	label: string;
	method: string;
	path: (workspaceId: number) => string;
}

/**
 * Every workspace sub-resource route, so the claims hold for the whole family and not one member.
 *
 * @param world - The world the requests run against, for the user a member write names.
 * @returns One entry per route under `/workspaces/:id/`.
 */
function subResources(world: World): SubResource[] {
	const target = world.targetUserId;
	return [
		{ label: 'GET members', method: 'GET', path: (id) => `/workspaces/${String(id)}/members` },
		{
			body: { role: 'VIEWER', userId: target },
			label: 'POST members',
			method: 'POST',
			path: (id) => `/workspaces/${String(id)}/members`,
		},
		{
			label: 'DELETE member',
			method: 'DELETE',
			path: (id) => `/workspaces/${String(id)}/members/${String(target)}`,
		},
		{
			body: { role: 'VIEWER' },
			label: 'PUT member role',
			method: 'PUT',
			path: (id) => `/workspaces/${String(id)}/members/${String(target)}/role`,
		},
		{
			body: { members: [{ role: 'VIEWER', userId: target }] },
			label: 'POST members bulk',
			method: 'POST',
			path: (id) => `/workspaces/${String(id)}/members/bulk`,
		},
		{
			body: { userIds: [target] },
			label: 'POST members bulk-delete',
			method: 'POST',
			path: (id) => `/workspaces/${String(id)}/members/bulk-delete`,
		},
	];
}

/** The status one sub-resource answers a caller with, for one workspace id. */
function status(app: App, route: SubResource, id: number, who: Actor): Promise<number> {
	return call(app, route.method, route.path(id), who, route.body).then(
		(response) => response.status,
	);
}

/** Claim 1: an absent id is not there, whoever can reach every workspace. */
async function checkAbsentAnswers404(app: App, world: World): Promise<void> {
	for (const route of subResources(world)) {
		const answer = await status(app, route, ABSENT_WORKSPACE, world.sysop);
		assert(
			answer === 404,
			`${route.label} must answer 404 for a workspace that does not exist, not ${String(answer)}`,
		);
	}
}

/** Claim 2: a caller with no access is answered the same way whether or not the workspace is there. */
async function checkOutsiderCannotProbe(app: App, world: World): Promise<void> {
	for (const route of subResources(world)) {
		const real = await status(app, route, world.memberWorkspace, world.outsider);
		const absent = await status(app, route, ABSENT_WORKSPACE, world.outsider);
		assert(
			real === 403,
			`${route.label} must answer a non-member 403 for a workspace that exists, not ${String(real)}`,
		);
		assert(
			absent === real,
			`${route.label} must answer a non-member the same for an absent workspace as for a real one, ` +
				`so the status cannot be used to probe existence (real ${String(real)}, absent ${String(absent)})`,
		);
	}
}

/** Claim 3: an empty collection and a missing workspace are different answers. */
async function checkEmptyIsNotAbsent(app: App, world: World): Promise<void> {
	const response = await call(
		app,
		'GET',
		`/workspaces/${String(world.emptyWorkspace)}/members`,
		world.sysop,
	);
	assert(
		response.status === 200,
		`a workspace that exists and holds no members must still answer 200, not ${String(response.status)}`,
	);
	assert(
		(await listed(response)).length === 0,
		'a workspace that exists and holds no members must answer with an empty collection',
	);
}

/** Claim 3: the ordinary case is untouched, which for a write means the write still happens. */
async function checkExistingWorkspaceUnchanged(app: App, world: World): Promise<void> {
	const path = `/workspaces/${String(world.memberWorkspace)}/members`;
	const before = await listed(await call(app, 'GET', path, world.sysop));

	const added = await call(app, 'POST', path, world.sysop, {
		role: 'VIEWER',
		userId: world.targetUserId,
	});
	assert(
		added.status === 201,
		`adding a member to a workspace that exists must still answer 201, not ${String(added.status)}`,
	);

	const after = await listed(await call(app, 'GET', path, world.sysop));
	assert(
		after.length === before.length + 1,
		`the added member must appear in the listing (${String(before.length)} before, ${String(after.length)} after)`,
	);

	const removed = await call(app, 'DELETE', `${path}/${String(world.targetUserId)}`, world.sysop);
	assert(
		removed.status === 200,
		`removing a member of a workspace that exists must still answer 200, not ${String(removed.status)}`,
	);
}

/**
 * Claim 4: a soft-deleted workspace is absent, to the member it kept as much as to a SYSOP.
 *
 * The member is the caller this was actually broken for. A soft delete leaves the membership rows
 * behind, so they pass the membership check and reach the handler, while the sibling route has
 * been answering 404 for the same workspace all along.
 */
async function checkSoftDeletedMatchesSibling(app: App, world: World): Promise<void> {
	const id = String(world.softDeletedWorkspace);
	for (const who of [world.sysop, world.deletedMember]) {
		const sibling = await call(app, 'GET', `/workspaces/${id}`, who);
		assert(
			sibling.status === 404,
			`the workspace route must answer 404 for a soft-deleted workspace, not ${String(sibling.status)}`,
		);
		for (const route of subResources(world)) {
			const answer = await status(app, route, world.softDeletedWorkspace, who);
			assert(
				answer === sibling.status,
				`${route.label} must answer a soft-deleted workspace the way the workspace route does ` +
					`(${String(sibling.status)}), not ${String(answer)}`,
			);
		}
	}
}

/** Claim 4: the writes did not merely change status, they stopped reaching the deleted workspace. */
async function checkSoftDeletedRejectsWrites(app: App, world: World): Promise<void> {
	const id = String(world.softDeletedWorkspace);
	const added = await call(app, 'POST', `/workspaces/${id}/members`, world.deletedMember, {
		role: 'VIEWER',
		userId: world.targetUserId,
	});
	assert(
		added.status === 404,
		`adding a member to a soft-deleted workspace must answer 404, not ${String(added.status)}`,
	);

	const bulk = await call(app, 'POST', `/workspaces/${id}/members/bulk`, world.deletedMember, {
		members: [{ role: 'VIEWER', userId: world.targetUserId }],
	});
	const body = (await bulk.json()) as { data?: { succeeded?: number } };
	assert(
		bulk.status === 404 && body.data?.succeeded === undefined,
		`a bulk add against a soft-deleted workspace must not report members added ` +
			`(status ${String(bulk.status)}, succeeded ${String(body.data?.succeeded)})`,
	);
}

/** Claim 5: the check has one owner, and no route can answer for a workspace without asking it. */
function checkOneOwner(): void {
	const counted = scopedRouteCount(repoRoot);
	assert(
		counted >= 6,
		`the scan must find the workspace routes it is asserting about, and found ${String(counted)}`,
	);

	const skipped = routesSkippingTheGuard(repoRoot);
	assert(
		skipped.length === 0,
		`every route naming a workspace in its path must reach a guard, which is what answers for a ` +
			`workspace that is not there; these do not: ${skipped.join(', ')}`,
	);

	const duplicated = existenceChecksOutsideTheGuards(repoRoot);
	assert(
		duplicated.length === 0,
		`only guards/workspaceAccess.ts may ask whether a workspace exists, because it is what orders ` +
			`the question after the access decision; these ask it themselves: ${duplicated.join(', ')}`,
	);
}

const { app, dispose, world } = await startWorld(repoRoot);
try {
	await checkAbsentAnswers404(app, world);
	await checkOutsiderCannotProbe(app, world);
	await checkEmptyIsNotAbsent(app, world);
	await checkExistingWorkspaceUnchanged(app, world);
	await checkSoftDeletedMatchesSibling(app, world);
	await checkSoftDeletedRejectsWrites(app, world);
	checkOneOwner();
} finally {
	await dispose();
}

if (failures.length > 0) {
	for (const failure of failures) console.error(`[FAIL] ${failure}`);
	console.error(
		`[FAIL] workspace sub-resource existence: ${String(failures.length)} claim(s) failed`,
	);
	process.exit(1);
}

console.log('[OK] every workspace sub-resource answers 404 for a workspace that is not there');
process.exit(0);
