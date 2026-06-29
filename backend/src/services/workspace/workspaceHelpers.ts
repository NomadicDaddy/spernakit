import { and, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { workspaces } from '../../db/schema/workspaces.ts';

/**
 * Find the default workspace ID.
 *
 * Looks for a workspace with `isDefault = true` first. If none exists,
 * falls back to the workspace with slug "default" and auto-sets the flag
 * (self-healing for databases seeded before the isDefault column was populated).
 *
 * @returns The ID of the default workspace, or null if none exists
 */
function getDefaultWorkspaceId(): null | number {
	const db = getDb();
	const row = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(and(eq(workspaces.isDefault, true), eq(workspaces.isDeleted, false)))
		.get();
	if (row) return row.id;

	// Fallback: find by slug and auto-set the isDefault flag
	const fallback = db
		.select({ id: workspaces.id })
		.from(workspaces)
		.where(and(eq(workspaces.slug, 'default'), eq(workspaces.isDeleted, false)))
		.get();
	if (fallback) {
		db.update(workspaces).set({ isDefault: true }).where(eq(workspaces.id, fallback.id)).run();
		return fallback.id;
	}

	return null;
}

export { getDefaultWorkspaceId };
