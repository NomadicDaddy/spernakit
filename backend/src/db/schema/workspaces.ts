import { relations, sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { WORKSPACE_ROLES } from 'spernakit-shared';

const WORKSPACE_MEMBER_ROLES = Object.values(WORKSPACE_ROLES) as unknown as readonly [
	string,
	...string[],
];
const WORKSPACE_MEMBER_ROLE_IN_LIST = Object.values(WORKSPACE_ROLES)
	.map((role) => `'${role}'`)
	.join(', ');

import { users } from './users.ts';

/**
 * Workspaces table for multi-tenancy support.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy for recoverable deletion
 * - Audit fields: createdBy, updatedBy for tracking who created/modified workspaces
 *
 * Soft-delete + unique constraint note:
 * Soft-deleted workspaces retain their slug in the unique index. This prevents URL
 * reuse confusion and preserves referential integrity in audit logs that reference
 * workspace slugs.
 *
 * Foreign key cascade behavior:
 * - ownerId: onDelete 'restrict' - Prevents deleting a user who owns workspaces. The user must
 *   transfer workspace ownership before their account can be deleted. This prevents orphan
 *   workspaces and ensures proper ownership handoff.
 * - createdBy: onDelete 'set null' — Workspace records persist when the creating user is deleted.
 * - updatedBy: onDelete 'set null' — Workspace records persist when the updating user is deleted.
 * - deletedBy: onDelete 'set null' — Workspace records persist when the deleting user is deleted.
 */
const workspaces = sqliteTable(
	'workspaces',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		description: text('description'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		name: text('name').notNull(),
		ownerId: integer('owner_id').notNull(),
		settings: text('settings', { mode: 'json' }).$type<Record<string, unknown>>(),
		slug: text('slug').notNull().unique(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
	},
	(table) => [
		// DB-level integrity guard: reject malformed JSON in the json-mode `settings` column.
		// json_valid() returns NULL for NULL input, so the CHECK still permits NULL values.
		check('chk_workspaces_settings_json', sql`json_valid(${table.settings})`),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_workspaces_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: 'fk_workspaces_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.ownerId],
			foreignColumns: [users.id],
			name: 'fk_workspaces_owner_id_users',
		}).onDelete('restrict'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_workspaces_updated_by_users',
		}).onDelete('set null'),
		index('idx_workspaces_owner_id').on(table.ownerId),
		index('idx_workspaces_is_deleted').on(table.isDeleted),
		index('idx_workspaces_slug_is_deleted').on(table.slug, table.isDeleted),
		// Partial unique index enforces the "at most one active default workspace" invariant.
		// workspaceHelpers.getDefaultWorkspaceId handles the zero-default case.
		uniqueIndex('idx_workspaces_is_default_active')
			.on(table.isDefault)
			.where(sql`${table.isDefault} = 1 AND ${table.isDeleted} = 0`),
	]
);

/**
 * Workspace members table for tracking workspace membership and roles.
 *
 * **Design Decision: Hard Delete for Membership Records**
 *
 * This table intentionally uses hard delete instead of soft delete. Unlike entities
 * like users or workspaces which represent data that should be recoverable, workspace
 * membership is a relationship, not data. The rationale for hard delete:
 *
 * 1. **Relationship vs. Data**: Membership is a transient state (user X has access to
 *    workspace Y). When access is revoked, the relationship ends cleanly. There's no
 *    business value in retaining "ghost" memberships.
 *
 * 2. **Audit Trail Coverage**: The audit plugin (backend/src/plugins/audit.ts) logs all
 *    membership removal operations before they occur, capturing who removed whom, from
 *    which workspace, at what time. This provides the compliance trail without database
 *    bloat.
 *
 * 3. **Unique Constraint Integrity**: Soft-deleted memberships would still occupy the
 *    (workspaceId, userId) unique index, preventing re-addition without additional
 *    complex filtering or a separate history table.
 *
 * 4. **Simplicity**: No need to filter by isDeleted in every membership query, reducing
 *    cognitive load and potential bugs from missed filters.
 *
 * If membership history tracking becomes a compliance requirement in the future, a
 * separate `workspace_members_history` table with archival records would be the
 * appropriate solution rather than soft-delete on the active membership table.
 *
 * Table features:
 * - Audit fields: createdBy, updatedBy for tracking who added/modified members
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'cascade' - When a user is deleted, their workspace memberships are
 *   automatically removed. This is safe because membership is a relationship, not data.
 * - workspaceId: onDelete 'cascade' - When a workspace is deleted, all memberships for that
 *   workspace are automatically removed.
 * - createdBy: onDelete 'set null' — Membership records persist when the adding user is deleted.
 * - updatedBy: onDelete 'set null' — Membership records persist when the updating user is deleted.
 */
const workspaceMembers = sqliteTable(
	'workspace_members',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		joinedAt: integer('joined_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		role: text('role', {
			enum: WORKSPACE_MEMBER_ROLES,
		})
			.notNull()
			.default('VIEWER'),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		userId: integer('user_id').notNull(),
		workspaceId: integer('workspace_id').notNull(),
	},
	(table) => [
		check(
			'chk_workspace_members_role',
			sql`${table.role} in (${sql.raw(WORKSPACE_MEMBER_ROLE_IN_LIST)})`
		),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_workspace_members_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_workspace_members_updated_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_workspace_members_user_id_users',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: 'fk_workspace_members_workspace_id_workspaces',
		}).onDelete('cascade'),
		index('idx_workspace_members_workspace_id').on(table.workspaceId),
		index('idx_workspace_members_user_id').on(table.userId),
		uniqueIndex('idx_workspace_members_workspace_user').on(table.workspaceId, table.userId),
	]
);

const workspacesRelations = relations(workspaces, ({ many, one }) => ({
	members: many(workspaceMembers),
	owner: one(users, { fields: [workspaces.ownerId], references: [users.id] }),
}));

const workspaceMembersRelations = relations(workspaceMembers, ({ one }) => ({
	user: one(users, { fields: [workspaceMembers.userId], references: [users.id] }),
	workspace: one(workspaces, {
		fields: [workspaceMembers.workspaceId],
		references: [workspaces.id],
	}),
}));

export { workspaceMembers, workspaceMembersRelations, workspaces, workspacesRelations };
