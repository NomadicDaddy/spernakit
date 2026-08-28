/**
 * The world `scripts/test-workspace-subresource-existence.ts` sends its requests into.
 *
 * That gate asks one question of every workspace sub-resource route: what does it answer for a
 * workspace that is not there. Answering it needs a workspace that exists and holds members, one
 * that exists and holds none, one that was soft-deleted, and an id that was never a workspace at
 * all, plus an account that can reach all of them and an account that can reach none. All of that
 * setup lives here so the gate reads as the list of claims rather than as a fixture script.
 *
 * The sub-resources are writes as well as reads, so unlike the header-contract world this one
 * carries a CSRF token per actor and a `call` that sends a body.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { UserRole } from '../../backend/src/types/roles.ts';

import { getConfig, initializeConfig } from '../../backend/src/config/configLoader.ts';
import { createApiApp } from '../../backend/src/create-api-app.ts';
import { runAutoMigrations } from '../../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../../backend/src/db/index.ts';
import { users } from '../../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../../backend/src/db/seed/users.ts';
import { signAccessToken } from '../../backend/src/plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../../backend/src/plugins/csrf.ts';
import {
	addMember,
	create as createWorkspace,
	removeMember,
	softDelete,
} from '../../backend/src/services/workspaceService.ts';
import { getSeedUsersWithPasswords } from '../../backend/src/utils/auth/passwordGenerator.ts';

/** Low bcrypt cost: this gate hashes a handful of passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;

/** An id no workspace was ever given, so naming it in a path names something that is not there. */
const ABSENT_WORKSPACE = 999_999;

type App = ReturnType<typeof createApiApp>;

/** One signed-in account, with everything a mutation needs to be accepted on its behalf. */
interface Actor {
	cookie: string;
	csrf: string;
	userId: number;
}

/** The workspaces and accounts the assertions act against. */
interface World {
	/** Holds a membership row in the soft-deleted workspace, which the delete left behind. */
	deletedMember: Actor;
	/** Exists, reachable by everyone, and holds no members at all. */
	emptyWorkspace: number;
	/** Exists and holds one member, which is the ordinary case a change must not disturb. */
	memberWorkspace: number;
	/** A member of nothing, so every workspace looks the same to them whether or not it is there. */
	outsider: Actor;
	/** Exists in the table with `isDeleted` set, which the query layer treats as absent. */
	softDeletedWorkspace: number;
	/** Reaches every workspace without a membership row, and is the one told a workspace is absent. */
	sysop: Actor;
	/** A seeded account no workspace holds, so a member write can add and remove it freely. */
	targetUserId: number;
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

/** An account the application will accept a read and a write from. */
async function actor(userId: number, role: UserRole): Promise<Actor> {
	const config = getConfig();
	const token = signAccessToken({ id: userId, role });
	return {
		cookie: `${config.security.authCookieName}=${token}`,
		csrf: await generateAndStoreCsrfToken(userId),
		userId,
	};
}

/** One request into the application as one actor, with a JSON body when the route takes one. */
function call(
	app: App,
	method: string,
	path: string,
	who: Actor,
	body?: unknown,
): Promise<Response> {
	const config = getConfig();
	const headers: Record<string, string> = {
		cookie: who.cookie,
		origin: config.server.frontendUrl,
		'X-CSRF-Token': who.csrf,
	};
	if (body !== undefined) headers['content-type'] = 'application/json';
	return app.handle(
		new Request(`http://localhost/api/v1${path}`, {
			...(body === undefined ? {} : { body: JSON.stringify(body) }),
			headers,
			method,
		}),
	);
}

/** The rows a listing returned, or an empty array when the body carried no collection. */
async function listed(response: Response): Promise<unknown[]> {
	const body = (await response.json()) as { data?: unknown };
	return Array.isArray(body.data) ? body.data : [];
}

/**
 * Four workspaces covering every answer a sub-resource route can owe.
 *
 * `create` adds the owner as an ADMIN member, so the empty workspace has that one member removed
 * again: a collection that is legitimately empty is a different answer from a workspace that is
 * not there, and the gate cannot tell them apart unless both exist.
 */
function buildWorld(sysop: Actor, deletedMember: Actor): Omit<World, 'outsider' | 'sysop'> {
	const memberWorkspace = createWorkspace({
		name: 'Subresource Existence',
		ownerId: sysop.userId,
		slug: 'subresource-existence',
	}).id;
	const emptyWorkspace = createWorkspace({
		name: 'Subresource Existence Empty',
		ownerId: sysop.userId,
		slug: 'subresource-existence-empty',
	}).id;
	const softDeletedWorkspace = createWorkspace({
		name: 'Subresource Existence Removed',
		ownerId: sysop.userId,
		slug: 'subresource-existence-removed',
	}).id;

	removeMember(emptyWorkspace, sysop.userId);
	// A soft delete leaves the membership rows behind, so this account still passes the membership
	// check for a workspace the query layer no longer returns. It is the caller the SYSOP existence
	// check never sees, because it never reaches the branch that runs one.
	addMember(softDeletedWorkspace, deletedMember.userId, 'ADMIN', sysop.userId);
	softDelete(softDeletedWorkspace, sysop.userId);

	return {
		deletedMember,
		emptyWorkspace,
		memberWorkspace,
		softDeletedWorkspace,
		targetUserId: seedUserId('MANAGER'),
	};
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

	const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-workspace-subresource-'));
	runAutoMigrations(join(tmpDir, 'test.db'), join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(join(tmpDir, 'test.db'));
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	// The seed may require a password change on first login, and its guard refuses every other route
	// while that flag is set, which would answer each request 403 for an unrelated reason.
	getDb().update(users).set({ requiresPasswordChange: false }).run();

	const sysop = await actor(seedUserId('SYSOP'), 'SYSOP');
	const outsider = await actor(seedUserId('VIEWER'), 'VIEWER');
	const deletedMember = await actor(seedUserId('OPERATOR'), 'OPERATOR');

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
		world: { ...buildWorld(sysop, deletedMember), outsider, sysop },
	};
}

export type { Actor, App, World };
export { ABSENT_WORKSPACE, call, listed, startWorld };
