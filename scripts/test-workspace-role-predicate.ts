#!/usr/bin/env bun
/**
 * Regression coverage for the workspace-role predicate and the guard built on it.
 *
 * `hasWorkspaceRole` answers whether a user holds a workspace role; `requireWorkspaceRole` rejects a
 * request that does not. Before the predicate existed the only way to ask the question was to invoke
 * the guard against a throwaway context and test its return for undefined, which built and discarded
 * an ErrorResponse on every capability read. This gate holds three properties:
 *
 *  1. The predicate decides correctly: non-member, member below the minimum, member at and above it,
 *     global SYSOP with no membership, global ADMIN with no membership, a deleted account, and a
 *     user row that does not exist.
 *  2. The guard and the predicate never disagree. For every case the guard grants access exactly
 *     when the predicate answers true, so a capability check and a rejection cannot diverge.
 *  3. The predicate is side-effect free: it writes no status onto anything, appends no audit row,
 *     and leaves the rows it consulted untouched. The guard, by contrast, does write a status.
 *
 * A fourth check is static: no source file under backend/src obtains a boolean by calling a
 * workspace guard with a discarded context.
 *
 * Runs in-process against a throwaway temp-file SQLite database, like scripts/test-lockout-refresh.ts.
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { auditLogs } from '../backend/src/db/schema/auditLogs.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { workspaceMembers, workspaces } from '../backend/src/db/schema/workspaces.ts';
import { hasWorkspaceRole, requireWorkspaceRole } from '../backend/src/guards/workspaceAccess.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WORKSPACE_ID = 1;
const MINIMUM = 'MANAGER' as const;

interface Case {
	/** Expected answer for `hasWorkspaceRole(userId, WORKSPACE_ID, MINIMUM)`. */
	expected: boolean;
	globalRole: 'ADMIN' | 'OPERATOR' | 'SYSOP';
	label: string;
	userId: number;
	why: string;
}

/**
 * One row per rule the predicate is required to apply. `userId` 99 is deliberately never inserted,
 * so it exercises the missing-account branch rather than the deleted-account one.
 */
const CASES: Case[] = [
	{
		expected: false,
		globalRole: 'OPERATOR',
		label: 'outsider',
		userId: 10,
		why: 'a non-member holds no workspace role',
	},
	{
		expected: false,
		globalRole: 'OPERATOR',
		label: 'viewer',
		userId: 11,
		why: 'VIEWER sits below MANAGER',
	},
	{
		expected: true,
		globalRole: 'OPERATOR',
		label: 'manager',
		userId: 12,
		why: 'MANAGER meets the minimum exactly',
	},
	{
		expected: true,
		globalRole: 'OPERATOR',
		label: 'admin',
		userId: 13,
		why: 'ADMIN sits above MANAGER',
	},
	{
		expected: true,
		globalRole: 'SYSOP',
		label: 'sysop-non-member',
		userId: 14,
		why: 'a global SYSOP is granted without workspace membership',
	},
	{
		expected: false,
		globalRole: 'ADMIN',
		label: 'global-admin-non-member',
		userId: 15,
		why: 'a global ADMIN is not a SYSOP and does not bypass workspace membership',
	},
	{
		expected: false,
		globalRole: 'OPERATOR',
		label: 'deleted-workspace-admin',
		userId: 16,
		why: 'a deleted account is denied even holding ADMIN in the workspace',
	},
	{
		expected: false,
		globalRole: 'OPERATOR',
		label: 'missing-user-row',
		userId: 99,
		why: 'an account that does not exist is denied',
	},
];

const MEMBERSHIPS: { role: 'ADMIN' | 'MANAGER' | 'VIEWER'; userId: number }[] = [
	{ role: 'VIEWER', userId: 11 },
	{ role: 'MANAGER', userId: 12 },
	{ role: 'ADMIN', userId: 13 },
	{ role: 'ADMIN', userId: 16 },
];

const failures: string[] = [];
let checks = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		checks++;
		return;
	}
	failures.push(message);
}

function seed(): void {
	const db = getDb();
	db.insert(users)
		.values({
			email: 'owner@example.com',
			id: 1,
			passwordHash: 'seeded-not-used',
			role: 'SYSOP',
			username: 'owner',
		})
		.run();
	db.insert(workspaces)
		.values({ id: WORKSPACE_ID, name: 'Predicate', ownerId: 1, slug: 'predicate' })
		.run();

	for (const testCase of CASES) {
		if (testCase.userId === 99) continue;
		db.insert(users)
			.values({
				email: `${testCase.label}@example.com`,
				id: testCase.userId,
				isDeleted: testCase.label === 'deleted-workspace-admin',
				passwordHash: 'seeded-not-used',
				role: testCase.globalRole,
				username: testCase.label,
			})
			.run();
	}

	for (const membership of MEMBERSHIPS) {
		db.insert(workspaceMembers)
			.values({ role: membership.role, userId: membership.userId, workspaceId: WORKSPACE_ID })
			.run();
	}
}

/** Criteria 1 and 2: the decision matrix, and guard/predicate agreement on every row of it. */
function checkDecisionsAgree(): void {
	for (const testCase of CASES) {
		const answer = hasWorkspaceRole(testCase.userId, WORKSPACE_ID, MINIMUM);
		assert(
			answer === testCase.expected,
			`hasWorkspaceRole for ${testCase.label} must be ${String(testCase.expected)} because ${testCase.why}, got ${String(answer)}`,
		);

		const set: { status?: number | string } = {};
		const guard = requireWorkspaceRole(
			{
				set,
				user: { id: testCase.userId, role: testCase.globalRole },
				workspaceId: WORKSPACE_ID,
			},
			MINIMUM,
		);
		assert(
			(guard === undefined) === answer,
			`requireWorkspaceRole must grant ${testCase.label} exactly when hasWorkspaceRole does (predicate ${String(answer)}, guard ${guard === undefined ? 'granted' : 'rejected'})`,
		);
		assert(
			answer ? set.status === undefined : set.status !== undefined,
			`requireWorkspaceRole must write a status for ${testCase.label} only when it rejects (status ${String(set.status)})`,
		);
	}
}

/** Criterion 3: asking the question changes nothing. */
function checkPredicateIsSideEffectFree(): void {
	const db = getDb();
	const auditBefore = db.select().from(auditLogs).all().length;
	const usersBefore = JSON.stringify(db.select().from(users).all());
	const membersBefore = JSON.stringify(db.select().from(workspaceMembers).all());

	// A context object of the shape the guard mutates. The predicate is given no such thing, which
	// is the point: its signature has no context for a future side effect to reach.
	const probe: { status?: number | string } = {};
	for (const testCase of CASES) hasWorkspaceRole(testCase.userId, WORKSPACE_ID, MINIMUM);

	assert(
		probe.status === undefined,
		`A capability query must not reach a guard context, got status ${String(probe.status)}`,
	);
	assert(
		hasWorkspaceRole.length === 3,
		`hasWorkspaceRole must take only userId, workspaceId and minimumRole, got ${String(hasWorkspaceRole.length)} parameters`,
	);
	assert(
		db.select().from(auditLogs).all().length === auditBefore,
		'Asking whether a role is held must append no audit row',
	);
	assert(
		JSON.stringify(db.select().from(users).all()) === usersBefore,
		'Asking whether a role is held must not modify any user row',
	);
	assert(
		JSON.stringify(db.select().from(workspaceMembers).all()) === membersBefore,
		'Asking whether a role is held must not modify any membership row',
	);
}

/** Criterion 4, static: nobody obtains a boolean by calling a guard with a discarded context. */
function checkNoGuardAsPredicateCallSites(): void {
	const backendSrc = join(repoRoot, 'backend', 'src');
	const guardCall = /require(?:SelectedWorkspaceAccess|WorkspaceAccess|WorkspaceRole)\(/g;
	const offenders: string[] = [];

	for (const entry of readdirSync(backendSrc, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
		const path = join(entry.parentPath, entry.name);
		const source = readFileSync(path, 'utf8');
		for (const match of source.matchAll(guardCall)) {
			const window = source.slice(match.index, match.index + 200).replace(/\s+/g, ' ');
			if (window.includes('set: {}') || window.includes('set:{}')) {
				offenders.push(`${path.slice(repoRoot.length + 1)}: ${window.slice(0, 90)}`);
			}
		}
	}

	assert(
		offenders.length === 0,
		`A workspace guard must not be called with a discarded context to obtain a boolean; call hasWorkspaceRole instead:\n     ${offenders.join('\n     ')}`,
	);
}

async function run(): Promise<void> {
	initializeConfig();
	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-role-predicate-'));
	const dbPath = join(tmpDir, 'test.db');

	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);

	try {
		seed();
		checkDecisionsAgree();
		checkPredicateIsSideEffectFree();
		checkNoGuardAsPredicateCallSites();
	} finally {
		await closeDatabase();
		try {
			rmSync(tmpDir, { force: true, recursive: true });
		} catch {
			// Windows may briefly hold the WAL handle; temp cleanup is best-effort.
		}
	}

	if (failures.length === 0) {
		console.log(`Workspace-role predicate checks passed (${String(checks)} assertions).`);
		return;
	}
	console.error('[FAIL] Workspace-role predicate regression:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-workspace-role-predicate:', err);
	process.exit(1);
});
