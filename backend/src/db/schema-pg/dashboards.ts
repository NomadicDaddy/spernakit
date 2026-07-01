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
import { METRIC_TYPES, WIDGET_TYPES } from 'spernakit-shared';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

/**
 * Dashboard configurations table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/dashboards.ts).
 * Type mappings differ by dialect:
 * - SQLite: integer with mode: 'timestamp'/'boolean'
 * - PostgreSQL: native timestamp/boolean types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/dashboards.ts for SQLite variant and full documentation
 */
const dashboardConfigs = pgTable(
	'dashboard_configs',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		id: serial('id').primaryKey(),
		isDeleted: boolean('is_deleted').notNull().default(false),
		name: text('name').notNull(),
		shareExpiresAt: timestamp('share_expires_at', { mode: 'date' }),
		shareToken: text('share_token'),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		userId: integer('user_id').notNull(),
		workspaceId: integer('workspace_id'),
	},
	(table) => [
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_dashboard_configs_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: 'fk_dashboard_configs_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_dashboard_configs_updated_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_dashboard_configs_user_id_users',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: 'fk_dashboard_configs_workspace_id_workspaces',
		}).onDelete('cascade'),
		index('idx_dashboard_configs_user_id').on(table.userId),
		uniqueIndex('idx_dashboard_configs_share_token').on(table.shareToken),
		index('idx_dashboard_configs_is_deleted').on(table.isDeleted),
		index('idx_dashboard_configs_user_id_is_deleted').on(table.userId, table.isDeleted),
		index('idx_dashboard_configs_workspace_id').on(table.workspaceId),
		index('idx_dashboard_configs_workspace_id_user_id').on(table.workspaceId, table.userId),
	]
);

/**
 * Dashboard widgets table (PostgreSQL variant).
 *
 * This schema maintains logical parity with the SQLite variant (../schema/dashboards.ts).
 * Type mappings differ by dialect:
 * - SQLite: text with mode: 'json'
 * - PostgreSQL: native jsonb types
 *
 * Both schemas MUST have identical logical fields. If you add a field to one,
 * add the equivalent to the other.
 *
 * @see ../schema/dashboards.ts for SQLite variant and full documentation
 */
const dashboardWidgets = pgTable(
	'dashboard_widgets',
	{
		col: integer('col').notNull().default(0),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		dashboardId: integer('dashboard_id').notNull(),
		deletedAt: timestamp('deleted_at', { mode: 'date' }),
		deletedBy: integer('deleted_by'),
		height: integer('height').notNull().default(2),
		id: serial('id').primaryKey(),
		isDeleted: boolean('is_deleted').notNull().default(false),
		metricType: text('metric_type', { enum: METRIC_TYPES }).notNull(),
		options: jsonb('options').$type<Record<string, unknown>>(),
		refreshInterval: integer('refresh_interval').notNull().default(60),
		row: integer('row').notNull().default(0),
		timeRange: text('time_range').notNull().default('6h'),
		title: text('title').notNull(),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		widgetType: text('widget_type', { enum: WIDGET_TYPES }).notNull(),
		width: integer('width').notNull().default(4),
	},
	(table) => [
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_dashboard_widgets_created_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.dashboardId],
			foreignColumns: [dashboardConfigs.id],
			name: 'fk_dashboard_widgets_dashboard_id_dashboard_configs',
		}).onDelete('cascade'),
		foreignKey({
			columns: [table.deletedBy],
			foreignColumns: [users.id],
			name: 'fk_dashboard_widgets_deleted_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.updatedBy],
			foreignColumns: [users.id],
			name: 'fk_dashboard_widgets_updated_by_users',
		}).onDelete('set null'),
		index('idx_dashboard_widgets_dashboard_id').on(table.dashboardId),
		index('idx_dashboard_widgets_is_deleted').on(table.isDeleted),
		index('idx_dashboard_widgets_dashboard_id_is_deleted').on(
			table.dashboardId,
			table.isDeleted
		),
	]
);

export { dashboardConfigs, dashboardWidgets };
