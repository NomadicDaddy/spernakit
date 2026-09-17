import { assert } from './workspace-subresource-tally.ts';
/**
 * The claims `scripts/test-workspace-subresource-existence.ts` sends into a running application.
 *
 * They live here rather than in the gate because they are the long half of it and they all ask one
 * question over HTTP: what does a workspace sub-resource answer for a name that points at nothing.
 * The gate keeps the claim list, the one claim that reads source instead of sending requests, and
 * the run itself.
 */
import {
	ABSENT_USER,
	ABSENT_WORKSPACE,
	type Actor,
	type App,
	call,
	listed,
	type World,
} from './workspace-subresource-world.ts';

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

/**
 * Claim 6: a user id in the body that names nobody is answered 404, not a conflict.
 *
 * `addMember` returned one boolean for two different refusals, and the route read every `false` as
 * "already a member". Adding a user id no account carries therefore answered 409 with "User is
 * already a member", which sends an operator looking for a membership row that was never there,
 * while the bulk route beside it answered "User not found" for the same id in the same workspace.
 * Two routes over one table cannot disagree about whether somebody exists.
 *
 * @param app - The started application.
 * @param world - The workspaces and accounts the request names.
 */
async function checkAbsentUserIsNotAConflict(app: App, world: World): Promise<void> {
	const path = `/workspaces/${String(world.memberWorkspace)}/members`;

	const single = await call(app, 'POST', path, world.sysop, {
		role: 'VIEWER',
		userId: ABSENT_USER,
	});
	const said = ((await single.json()) as { message?: string }).message ?? '';
	assert(
		single.status === 404,
		`adding a user that does not exist must answer 404, not ${String(single.status)}`,
	);
	assert(
		!said.includes('already a member'),
		`adding a user that does not exist must not report a membership that was never there, ` +
			`and said: ${said}`,
	);

	const bulk = await call(app, 'POST', `${path}/bulk`, world.sysop, {
		members: [{ role: 'VIEWER', userId: ABSENT_USER }],
	});
	const item = ((await bulk.json()) as { data?: { results?: { error?: string }[] } }).data
		?.results?.[0];
	assert(
		item?.error === 'User not found',
		`the bulk route must go on answering that a user that does not exist was not found, ` +
			`and said: ${String(item?.error)}`,
	);
	assert(
		said === 'User not found',
		`the single-add route must say what the bulk route beside it says for the same user id ` +
			`("User not found"), and said: ${said}`,
	);
}

/**
 * Claim 6: a membership that is really there still conflicts, which 404 must not have replaced.
 *
 * The sysop is a member of this workspace already, because creating one adds its owner.
 *
 * @param app - The started application.
 * @param world - The workspaces and accounts the request names.
 */
async function checkDuplicateStillConflicts(app: App, world: World): Promise<void> {
	const again = await call(
		app,
		'POST',
		`/workspaces/${String(world.memberWorkspace)}/members`,
		world.sysop,
		{ role: 'VIEWER', userId: world.sysop.userId },
	);
	const body = (await again.json()) as { message?: string };
	assert(
		again.status === 409,
		`adding a user who is already a member must still answer 409, not ${String(again.status)}`,
	);
	assert(
		body.message === 'User is already a member',
		`a membership that is really there must still be reported as one, and said: ${String(body.message)}`,
	);
}

export {
	checkAbsentAnswers404,
	checkAbsentUserIsNotAConflict,
	checkDuplicateStillConflicts,
	checkEmptyIsNotAbsent,
	checkExistingWorkspaceUnchanged,
	checkOutsiderCannotProbe,
	checkSoftDeletedMatchesSibling,
	checkSoftDeletedRejectsWrites,
};
