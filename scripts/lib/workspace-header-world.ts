/**
 * The world `scripts/test-workspace-header-contract.ts` sends its requests into.
 *
 * The gate itself is a list of claims the workspace-header precondition has to satisfy. Everything
 * needed before a claim can be checked lives here: a throwaway SQLite file with the migrations
 * applied, the seeded accounts, two workspaces holding one audit entry and one file each, and the
 * small readers that turn a response back into the value an assertion compares.
 *
 * Keeping it separate holds both files inside the 300-line modularity gate, and leaves the gate
 * readable as a list of claims rather than a setup script with the claims at the end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { UserRole } from '../../backend/src/types/roles.ts';

import { getConfig, initializeConfig } from '../../backend/src/config/configLoader.ts';
import { createApiApp } from '../../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../../backend/src/db/index.ts';
import { fileUploads } from '../../backend/src/db/schema/fileUploads.ts';
import { users } from '../../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../../backend/src/db/seed/users.ts';
import { WORKSPACE_HEADER } from '../../backend/src/guards/workspaceHeader.ts';
import { signAccessToken } from '../../backend/src/plugins/auth.ts';
import { log as writeAuditEntry } from '../../backend/src/services/auditService.ts';
import {
	addMember,
	create as createWorkspace,
} from '../../backend/src/services/workspaceService.ts';
import { getSeedUsersWithPasswords } from '../../backend/src/utils/auth/passwordGenerator.ts';

/** Low bcrypt cost: this gate hashes a handful of passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;
/** Guarded by a role floor, and its workspace guard runs from `beforeHandle`. */
const AUDIT = '/api/v1/audit-logs';
/** Open to any signed-in account, and its workspace guard runs inside the handler. */
const FILES = '/api/v1/files';
/** An id no workspace was given, so naming it is naming something that is not there. */
const ABSENT_WORKSPACE = 999_999;

type App = ReturnType<typeof createApiApp>;

/** Who is asking, and which workspace (if any) they named. */
interface Caller {
	role: UserRole;
	userId: number;
	workspaceId?: number;
}

/** The two workspaces and the accounts the assertions act as. */
interface World {
	adminId: number;
	memberWorkspace: number;
	otherWorkspace: number;
	sysopId: number;
	viewerId: number;
}

/** A started application, the world behind it, and the way to put both away again. */
interface Harness {
	app: App;
	dispose: () => Promise<void>;
	world: World;
}

/** The id of a seeded account, looked up by the role the seed gave it. */
function seedUserId(role: UserRole): number {
	const seed = getSeedUsersWithPasswords(false).find((user) => user.role === role);
	if (!seed) throw new Error(`SEED_USERS carries no ${role} account`);
	const row = getDb()
		.select()
		.from(users)
		.all()
		.find((user) => user.username === seed.username);
	if (!row) throw new Error(`the seed produced no ${seed.username} account`);
	return row.id;
}

/** A read as one caller. Every route here is a GET, so no CSRF token is involved. */
function get(app: App, path: string, caller: Caller): Promise<Response> {
	const config = getConfig();
	const token = signAccessToken({ id: caller.userId, role: caller.role });
	return app.handle(
		new Request(`http://localhost${path}`, {
			headers: {
				cookie: `${config.security.authCookieName}=${token}`,
				origin: config.server.frontendUrl,
				...(caller.workspaceId === undefined
					? {}
					: { [WORKSPACE_HEADER]: String(caller.workspaceId) }),
			},
			method: 'GET',
		}),
	);
}

/** The status and message of a refusal, as the caller reads them. */
async function refusal(response: Response): Promise<{ message: string; status: number }> {
	const body = (await response.json()) as { message?: string };
	return { message: body.message ?? '', status: response.status };
}

/** The `action` of every audit entry a listing returned. */
async function listedActions(response: Response): Promise<string[]> {
	const body = (await response.json()) as { data: { action: string }[] };
	return body.data.map((entry) => entry.action);
}

/** The workspace of every file a listing returned. */
async function listedFileWorkspaces(response: Response): Promise<(null | number)[]> {
	const body = (await response.json()) as { data: { workspaceId: null | number }[] };
	return body.data.map((file) => file.workspaceId);
}

/**
 * Two workspaces holding one audit entry and one file each.
 *
 * The ADMIN and the VIEWER are members of the first and of nothing else, so the second is a
 * workspace they can name and cannot reach. The SYSOP is a member of neither, which is the point:
 * they can reach both without a membership row, so what they get back is decided by the header.
 */
function buildWorld(): World {
	const sysopId = seedUserId('SYSOP');
	const adminId = seedUserId('ADMIN');
	const viewerId = seedUserId('VIEWER');
	const memberWorkspace = createWorkspace({
		name: 'Header Contract',
		ownerId: adminId,
		slug: 'header-contract',
	}).id;
	const otherWorkspace = createWorkspace({
		name: 'Header Contract Elsewhere',
		ownerId: sysopId,
		slug: 'header-contract-elsewhere',
	}).id;
	addMember(memberWorkspace, viewerId, 'VIEWER');

	for (const [workspaceId, suffix] of [
		[memberWorkspace, 'here'],
		[otherWorkspace, 'elsewhere'],
	] as const) {
		writeAuditEntry({ action: `probe.workspace.${suffix}`, userId: adminId, workspaceId });
		getDb()
			.insert(fileUploads)
			.values({
				filename: `probe-${suffix}.txt`,
				mimeType: 'text/plain',
				originalName: `probe-${suffix}.txt`,
				size: 4,
				storagePath: `probe/${suffix}.txt`,
				uploadedBy: sysopId,
				workspaceId,
			})
			.run();
	}

	return { adminId, memberWorkspace, otherWorkspace, sysopId, viewerId };
}

/**
 * A migrated, seeded application on a temp-file database, with the world above already in it.
 *
 * @param repoRoot - Absolute path to the repository root, which is where the migrations are.
 * @returns The application, the world, and a `dispose` that closes and removes both.
 */
async function startWorld(repoRoot: string): Promise<Harness> {
	initializeConfig();
	const config = getConfig();
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-workspace-header-'));
	runAutoMigrations(join(tmpDir, 'test.db'), join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(join(tmpDir, 'test.db'));
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	// The seed may require a password change on first login, and its guard refuses every other route
	// while that flag is set, which would answer each read 403 for an unrelated reason.
	getDb().update(users).set({ requiresPasswordChange: false }).run();

	const world = buildWorld();
	return {
		app: createApiApp(),
		dispose: async () => {
			await closeDatabase();
			try {
				rmSync(tmpDir, { force: true, recursive: true });
			} catch {
				// Windows may briefly hold the WAL file handle; temp cleanup is best-effort.
			}
		},
		world,
	};
}

export type { App, Caller, World };
export {
	ABSENT_WORKSPACE,
	AUDIT,
	FILES,
	get,
	listedActions,
	listedFileWorkspaces,
	refusal,
	startWorld,
};
