import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { workspaces } from '../../db/schema/workspaces.ts';

/**
 * Flag a workspace as the default and return its ID.
 *
 * @param id - Workspace ID to adopt as the default
 * @returns The same workspace ID
 */
function adopt(id: number): number {
	getDb().update(workspaces).set({ isDefault: true }).where(eq(workspaces.id, id)).run();
	return id;
}

/**
 * Find the default workspace ID.
 *
 * Looks for a workspace with `isDefault = true` first, then the workspace with
 * slug "default" (for databases seeded before the isDefault column existed),
 * then the oldest surviving workspace. Each fallback adopts the flag as it goes.
 *
 * The last fallback is what makes a deployment recoverable. Only the seed ever
 * writes `isDefault`, and a soft-deleted workspace keeps its slug in the unique
 * index, so once the original default was deleted the slug "default" could never
 * be taken again and the slug fallback could never match. Every later
 * registration then produced a user with no workspace membership, permanently,
 * and the only way back was editing the database by hand.
 *
 * @returns The ID of the default workspace, or null if no workspace survives
 */
function getDefaultWorkspaceId(): null | number {
	const db = getDb();
	const row = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(and(eq(workspaces.isDefault, true), eq(workspaces.isDeleted, false)))
		.get();
	if (row) return row.id;

	// Fallback: the conventionally-named workspace, if it is still around.
	const bySlug = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(and(eq(workspaces.slug, 'default'), eq(workspaces.isDeleted, false)))
		.get();
	if (bySlug) return adopt(bySlug.id);

	// Last resort: the oldest surviving workspace. Reached when the original
	// default was deleted, which used to leave the deployment unrecoverable.
	const oldest = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(eq(workspaces.isDeleted, false))
		.orderBy(asc(workspaces.id))
		.get();
	if (oldest) return adopt(oldest.id);

	return null;
}

export { getDefaultWorkspaceId };
