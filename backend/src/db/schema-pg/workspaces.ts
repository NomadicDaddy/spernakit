import { relations, sql } from 'drizzle-orm';
import {
	boolean,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
	uniqueIndex,
} from 'drizzle-orm/pg-core';
import { WORKSPACE_ROLES } from 'spernakit-shared';

const WORKSPACE_MEMBER_ROLES = Object.values(WORKSPACE_ROLES) as unknown as readonly [
	string,
	...string[],
];

import { users } from './users.ts';

/**
 * Workspaces table for multi-tenancy support (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/workspaces.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'/'boolean', text with mode: 'json'
 * - PostgreSQL: native timestamp/boolean/jsonb types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/workspaces.ts for SQLite variant and full documentation
 */
const workspaces = pgTable(
	'workspaces',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		description: text('description'),
		id: serial('id').primaryKey(),
		isDefault: boolean('is_default').notNull().default(false),
		isDeleted: boolean('is_deleted').notNull().default(false),
		name: text('name').notNull(),
		ownerId: integer('owner_id').notNull(),
		settings: jsonb('settings').$type<Record<string, unknown>>(),
		slug: text('slug').notNull().unique(),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
	},
	(table) => [
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
		// Partial unique index enforces the "at most one active default workspace" invariant
		// at the database layer. Replaces the prior non-unique covering index
		// idx_workspaces_is_default_is_deleted. workspaceHelpers.getDefaultWorkspaceId retains
		// self-healing for the zero-default case.
		uniqueIndex('idx_workspaces_is_default_active')
			.on(table.isDefault)
			.where(sql`${table.isDefault} = true AND ${table.isDeleted} = false`),
	]
);

/**
 * Workspace members table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/workspaces.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'
 * - PostgreSQL: native timestamp types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/workspaces.ts for SQLite variant and full documentation
 */
const workspaceMembers = pgTable(
	'workspace_members',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		id: serial('id').primaryKey(),
		joinedAt: timestamp('joined_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		role: text('role', {
			enum: WORKSPACE_MEMBER_ROLES,
		})
			.notNull()
			.default('VIEWER'),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		userId: integer('user_id').notNull(),
		workspaceId: integer('workspace_id').notNull(),
	},
	(table) => [
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
