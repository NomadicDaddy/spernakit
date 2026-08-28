#!/usr/bin/env bun
/**
 * Regression coverage for the workspace-header precondition
 * (`.aidd/features/remediation-20260827-workspace-header-precondition-contract`).
 *
 * Two defects were reported together. The visible one was that a caller who left the header off was
 * told two different things depending on which route they hit, in two different spellings of the
 * header name, neither matching what the CORS allow-list publishes or the client sends. The one
 * with a consequence was quieter: the scope of a listing was decided by re-reading the caller's
 * role, so a SYSOP who named a workspace had that id discarded and received every workspace's rows
 * instead of the one they asked for. Widening is the worst possible answer to a request to narrow.
 *
 * What is under test is the precondition itself rather than the two routes it is exercised through:
 * one message and one status for a missing header, the same order of role and header everywhere,
 * and a scope that follows the header whoever sent it. The two routes are deliberately from
 * different modules and stack their guards differently, and three source scans cover the routes
 * this gate does not send a request to.
 *
 * Runs in process against a throwaway temp-file SQLite database.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { App, Caller, World } from './lib/workspace-header-world.ts';

import {
	MISSING_WORKSPACE_HEADER,
	WORKSPACE_HEADER,
} from '../backend/src/guards/workspaceHeader.ts';
import {
	findDiscardedWorkspaceIds,
	findUnownedHeaderMessages,
	findWrongHeaderSpellings,
} from './lib/workspace-header-scan.ts';
import {
	ABSENT_WORKSPACE,
	AUDIT,
	FILES,
	get,
	listedActions,
	listedFileWorkspaces,
	refusal,
	startWorld,
} from './lib/workspace-header-world.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * A request that names no workspace is refused the same way on both routes.
 *
 * This is the reported defect at its plainest: the same unmet precondition, one status and one
 * message, whichever module the caller happened to reach.
 */
async function missingHeaderIsOneAnswer(app: App, world: World): Promise<void> {
	const caller: Caller = { role: 'ADMIN', userId: world.adminId };
	const audit = await refusal(await get(app, AUDIT, caller));
	const files = await refusal(await get(app, FILES, caller));
	for (const [path, answer] of [
		[AUDIT, audit],
		[FILES, files],
	] as const) {
		assert(
			answer.status === 400,
			`${path} must answer a missing header 400, got ${String(answer.status)}`,
		);
		assert(
			answer.message === MISSING_WORKSPACE_HEADER,
			`${path} must use the guard's message, got ${JSON.stringify(answer.message)}`,
		);
	}
	assert(
		audit.message === files.message && audit.status === files.status,
		'the two routes must give the same answer to the same missing header',
	);
}

/**
 * The caller's role is settled before the header is looked at.
 *
 * A VIEWER who sends no header fails both preconditions on the audit listing and hears about the
 * role, because the role floor is a route option the auth plugin runs at the transform stage and
 * the header check runs after it. The file listing has no role floor, so the same caller reaches
 * the header check and is answered by it. The order is the same on both; only the floor differs.
 */
async function roleIsSettledFirst(app: App, world: World): Promise<void> {
	const caller: Caller = { role: 'VIEWER', userId: world.viewerId };
	const audit = await refusal(await get(app, AUDIT, caller));
	assert(
		audit.status === 403,
		`a VIEWER below the audit role floor must hear about the role, got ${String(audit.status)}`,
	);
	const files = await refusal(await get(app, FILES, caller));
	assert(
		files.status === 400 && files.message === MISSING_WORKSPACE_HEADER,
		`a route with no role floor must answer the same VIEWER with the missing-header 400, got ${String(files.status)} ${JSON.stringify(files.message)}`,
	);
}

/**
 * A workspace a SYSOP named is honoured, and leaving the header off keeps the wider view.
 *
 * This is the half with a consequence. Discarding the id answered a request to narrow with more
 * than was asked for, and nothing in the response said so.
 */
async function aNamedWorkspaceIsHonoured(app: App, world: World): Promise<void> {
	const sysop = { role: 'SYSOP' as const, userId: world.sysopId };
	const scopedActions = await listedActions(
		await get(app, AUDIT, { ...sysop, workspaceId: world.otherWorkspace }),
	);
	assert(
		scopedActions.includes('probe.workspace.elsewhere'),
		'a SYSOP naming a workspace must see that workspace of audit entries',
	);
	assert(
		!scopedActions.includes('probe.workspace.here'),
		'a SYSOP naming a workspace must not be answered with another workspace of audit entries',
	);
	const wide = await listedActions(await get(app, AUDIT, sysop));
	assert(
		wide.includes('probe.workspace.here') && wide.includes('probe.workspace.elsewhere'),
		'a SYSOP who names no workspace must keep the cross-workspace audit view',
	);

	const scopedFiles = await listedFileWorkspaces(
		await get(app, FILES, { ...sysop, workspaceId: world.otherWorkspace }),
	);
	assert(
		scopedFiles.length > 0 && scopedFiles.every((id) => id === world.otherWorkspace),
		`a SYSOP naming a workspace must be listed only its files, got ${JSON.stringify(scopedFiles)}`,
	);
	const wideFiles = await listedFileWorkspaces(await get(app, FILES, sysop));
	assert(
		wideFiles.includes(world.memberWorkspace) && wideFiles.includes(world.otherWorkspace),
		'a SYSOP who names no workspace must keep the cross-workspace file view',
	);
}

/**
 * A SYSOP naming a workspace that is not there is told so, rather than answered more broadly.
 *
 * Everyone else is answered 403 by the membership check, which deliberately reads the same whether
 * the workspace is absent or merely out of reach, so nothing here leaks which workspaces exist.
 */
async function anAbsentWorkspaceIsRefused(app: App, world: World): Promise<void> {
	for (const path of [AUDIT, FILES]) {
		const answer = await refusal(
			await get(app, path, {
				role: 'SYSOP',
				userId: world.sysopId,
				workspaceId: ABSENT_WORKSPACE,
			}),
		);
		assert(
			answer.status === 404,
			`${path} must answer a SYSOP naming an absent workspace 404, got ${String(answer.status)}`,
		);
	}
	for (const path of [AUDIT, FILES]) {
		const answer = await refusal(
			await get(app, path, {
				role: 'ADMIN',
				userId: world.adminId,
				workspaceId: world.otherWorkspace,
			}),
		);
		assert(
			answer.status === 403,
			`${path} must answer a non-member 403 rather than say whether it exists, got ${String(answer.status)}`,
		);
	}
	const reachable = await get(app, AUDIT, {
		role: 'ADMIN',
		userId: world.adminId,
		workspaceId: world.memberWorkspace,
	});
	assert(
		reachable.status === 200,
		`a member naming their own workspace must be served, got ${String(reachable.status)}`,
	);
}

/**
 * The precondition lives in one place, so a route added later cannot invent a third of anything.
 *
 * Each scan covers a route this gate never sends a request to, which is the only way the contract
 * holds for the ones written after it.
 */
function thePreconditionLivesInOnePlace(): void {
	const discarded = findDiscardedWorkspaceIds(repoRoot);
	assert(
		discarded.length === 0,
		`the scope must follow the header, not the caller's role: ${discarded.join(', ')}`,
	);
	const misspelled = findWrongHeaderSpellings(repoRoot);
	assert(
		misspelled.length === 0,
		`the header has one spelling, ${WORKSPACE_HEADER}: ${misspelled.join(', ')}`,
	);
	const unowned = findUnownedHeaderMessages(repoRoot);
	assert(
		unowned.length === 0,
		`only guards/workspaceHeader.ts may word a message about the header: ${unowned.join(', ')}`,
	);
	const client = readFileSync(
		join(repoRoot, 'frontend', 'src', 'api', 'requestHelpers.ts'),
		'utf8',
	);
	assert(
		client.includes(`'${WORKSPACE_HEADER}'`),
		'the frontend client must send the spelling the server publishes',
	);
	for (const route of ['routes/audit.ts', 'routes/files/crud.ts']) {
		const source = readFileSync(join(repoRoot, 'backend', 'src', route), 'utf8');
		assert(
			source.includes('missingWorkspaceHeaderExample'),
			`${route} must document the status a missing header returns`,
		);
	}
}

async function run(): Promise<void> {
	const { app, dispose, world } = await startWorld(repoRoot);

	await missingHeaderIsOneAnswer(app, world);
	await roleIsSettledFirst(app, world);
	await aNamedWorkspaceIsHonoured(app, world);
	await anAbsentWorkspaceIsRefused(app, world);
	thePreconditionLivesInOnePlace();

	await dispose();

	if (failures.length === 0) {
		console.log('[OK] workspace-header-contract: one answer, and the scope follows the header');
		process.exit(0);
	}
	console.error('[FAIL] workspace-header-contract:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-workspace-header-contract:', err);
	process.exit(1);
});
