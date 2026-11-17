#!/usr/bin/env bun
/**
 * Gate: workspace deletion runs the handlers applications register with onWorkspaceDeleted,
 * inside the delete's own transaction (`.aidd/features/workspace-deleted-hook`).
 *
 * Against a throwaway migrated SQLite database with the real seed accounts:
 *  1. With nothing registered, a workspace deletes exactly as before.
 *  2. Registered handlers run in registration order, after the soft delete, with the workspace id,
 *     the deleting user and the transaction, and their writes commit with the delete.
 *  3. A handler that throws fails the delete: the workspace stays active, an earlier handler's
 *     write is rolled back, and the error names the failing handler.
 *  4. A handler that returns a promise is refused the same way, since its work would escape the
 *     transaction.
 *  5. Registering a second handler under a taken name throws.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { runAutoMigrations } from '../backend/src/db/autoMigrate.ts';
import { closeDatabase, getDb, initializeDatabase } from '../backend/src/db/index.ts';
import { settings } from '../backend/src/db/schema/settings.ts';
import { users } from '../backend/src/db/schema/users.ts';
import { workspaces } from '../backend/src/db/schema/workspaces.ts';
import { seedUsersIfEmpty } from '../backend/src/db/seed/users.ts';
import {
	create,
	onWorkspaceDeleted,
	softDelete,
	WorkspaceDeletedHandlerError,
} from '../backend/src/services/workspaceService.ts';
import { getSeedUsersWithPasswords } from '../backend/src/utils/auth/passwordGenerator.ts';

const repoRoot = resolve(import.meta.dir, '..');

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** What the handlers saw, and which behaviour each workspace asks of them. */
const calls: { deletedBy: number; name: string; sawDeleted: boolean; workspaceId: number }[] = [];
const failFor = new Set<number>();
const asyncFor = new Set<number>();

function isDeleted(id: number): boolean | undefined {
	return getDb()
		.select()
		.from(workspaces)
		.all()
		.find((w) => w.id === id)?.isDeleted;
}

function cleanupKey(id: number): boolean {
	return getDb()
		.select()
		.from(settings)
		.all()
		.some((s) => s.key === `cleanup.${String(id)}`);
}

function registerHandlers(): void {
	onWorkspaceDeleted('first', ({ deletedBy, tx, workspaceId }) => {
		const row = tx
			.select()
			.from(workspaces)
			.all()
			.find((w) => w.id === workspaceId);
		calls.push({ deletedBy, name: 'first', sawDeleted: row?.isDeleted === true, workspaceId });
		tx.insert(settings)
			.values({ key: `cleanup.${String(workspaceId)}`, value: 'done' })
			.run();
	});
	onWorkspaceDeleted('second', ({ deletedBy, workspaceId }) => {
		calls.push({ deletedBy, name: 'second', sawDeleted: true, workspaceId });
		if (failFor.has(workspaceId)) throw new Error('fixture failure');
	});
	onWorkspaceDeleted('third', ({ workspaceId }) => {
		if (asyncFor.has(workspaceId)) return Promise.resolve() as unknown as void;
	});
}

function refusal(id: number, deletedBy: number): undefined | WorkspaceDeletedHandlerError {
	try {
		softDelete(id, deletedBy);
	} catch (err) {
		if (err instanceof WorkspaceDeletedHandlerError) return err;
		throw err;
	}
	return undefined;
}

function run(ownerId: number): void {
	const make = (slug: string): number => create({ name: slug, ownerId, slug }).id;
	const plain = make('plain');
	const ordered = make('ordered');
	const failing = make('failing');
	const promised = make('promised');

	// 1. No handlers registered yet.
	assert(softDelete(plain, ownerId), '1: a workspace should delete with no handlers registered');
	assert(isDeleted(plain) === true, '1: the workspace should be soft-deleted');

	registerHandlers();

	// 2. Order, context and commit.
	assert(softDelete(ordered, ownerId), '2: a workspace should delete with handlers registered');
	const seen = calls.filter((c) => c.workspaceId === ordered);
	assert(
		seen.map((c) => c.name).join(',') === 'first,second',
		`2: handlers should run in registration order, saw ${seen.map((c) => c.name).join(',')}`,
	);
	assert(
		seen.every((c) => c.deletedBy === ownerId),
		'2: handlers should receive the deleting user',
	);
	assert(seen[0]?.sawDeleted === true, '2: handlers should run after the soft delete');
	assert(cleanupKey(ordered), '2: a handler write should commit with the delete');

	// 3. A throwing handler rolls the delete back and is named.
	failFor.add(failing);
	const thrown = refusal(failing, ownerId);
	assert(
		thrown?.handlerName === 'second',
		`3: the error should name "second", got ${thrown?.handlerName}`,
	);
	assert(thrown?.message.includes('"second"') === true, '3: the message should name the handler');
	assert(isDeleted(failing) === false, '3: the workspace should stay active');
	assert(!cleanupKey(failing), "3: the earlier handler's write should roll back");

	// 4. A promise-returning handler is refused.
	asyncFor.add(promised);
	const promisedError = refusal(promised, ownerId);
	assert(
		promisedError?.handlerName === 'third',
		'4: a promise-returning handler should be refused',
	);
	assert(isDeleted(promised) === false, '4: the workspace should stay active');

	// 5. Duplicate names.
	let duplicate = false;
	try {
		onWorkspaceDeleted('first', () => undefined);
	} catch {
		duplicate = true;
	}
	assert(duplicate, '5: registering a taken name should throw');
}

initializeConfig();
const tmpDir = mkdtempSync(join(tmpdir(), 'spernakit-workspace-deleted-'));
try {
	const dbPath = join(tmpDir, 'test.db');
	runAutoMigrations(dbPath, join(repoRoot, 'backend', 'drizzle'));
	initializeDatabase(dbPath);
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), 4);
	const owner = getDb()
		.select()
		.from(users)
		.all()
		.find((u) => u.role === 'ADMIN');
	if (!owner) throw new Error('the seed produced no ADMIN account');
	run(owner.id);
} finally {
	await closeDatabase();
	// Statements cached on the closed handle keep the file open on Windows until collected.
	Bun.gc(true);
	try {
		rmSync(tmpDir, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
	} catch {
		console.warn(`workspace deleted hook: could not remove ${tmpDir}; remove it by hand`);
	}
}

if (failures.length > 0) {
	console.error(`workspace deleted hook: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('workspace deleted hook: all checks passed');
