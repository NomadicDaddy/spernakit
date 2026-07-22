import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	sqliteTable,
	text,
	uniqueIndex,
} from 'drizzle-orm/sqlite-core';
import { METRIC_TYPES, WIDGET_TYPES } from 'spernakit-shared';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

const METRIC_TYPE_IN_LIST = METRIC_TYPES.map((type) => `'${type}'`).join(', ');
const WIDGET_TYPE_IN_LIST = WIDGET_TYPES.map((type) => `'${type}'`).join(', ');

/**
 * Dashboard configurations table.
 *
 * Stores user-created monitoring dashboards with layout metadata.
 * Each dashboard belongs to a user and is scoped to an optional workspace
 * so the workspace switcher filters the /dashboards list per tenant.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy for recoverable deletion
 * - Audit fields: createdBy, updatedBy for tracking who created/modified dashboards
 *
 * Design note — workspaceId nullability:
 * workspaceId is nullable so SYSOP-level global dashboards can exist without a workspace.
 * For regular users the route layer always supplies the active X-Workspace-ID header.
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'cascade' — Dashboards are deleted when the owning user is deleted.
 * - workspaceId: onDelete 'cascade' — Dashboards are deleted when their workspace is deleted.
 * - createdBy: onDelete 'set null' — Dashboard records persist when the creating user is deleted.
 * - updatedBy: onDelete 'set null' — Dashboard records persist when the updating user is deleted.
 */
const dashboardConfigs = sqliteTable(
	'dashboard_configs',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		name: text('name').notNull(),
		shareExpiresAt: integer('share_expires_at', { mode: 'timestamp' }),
		shareToken: text('share_token'),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
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
 * Widget configuration for a dashboard layout position.
 *
 * Each widget references a parent dashboard and stores its grid position,
 * size, data source, and display options as JSON.
 *
 * Table features:
 * - Soft delete: isDeleted, deletedAt, deletedBy for recoverable deletion
 * - Audit fields: createdBy, updatedBy for tracking who created/modified widgets
 *
 * Foreign key cascade behavior:
 * - dashboardId: onDelete 'cascade' — Widgets are deleted when the dashboard is deleted.
 * - createdBy: onDelete 'set null' — Widget records persist when the creating user is deleted.
 * - updatedBy: onDelete 'set null' — Widget records persist when the updating user is deleted.
 * - deletedBy: onDelete 'set null' — Widget records persist when the deleting user is deleted.
 */
const dashboardWidgets = sqliteTable(
	'dashboard_widgets',
	{
		col: integer('col').notNull().default(0),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		createdBy: integer('created_by'),
		dashboardId: integer('dashboard_id').notNull(),
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: integer('deleted_by'),
		height: integer('height').notNull().default(2),
		id: integer('id').primaryKey({ autoIncrement: true }),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		metricType: text('metric_type', { enum: METRIC_TYPES }).notNull(),
		options: text('options', { mode: 'json' }).$type<Record<string, unknown>>(),
		refreshInterval: integer('refresh_interval').notNull().default(60),
		row: integer('row').notNull().default(0),
		timeRange: text('time_range').notNull().default('6h'),
		title: text('title').notNull(),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		updatedBy: integer('updated_by'),
		widgetType: text('widget_type', { enum: WIDGET_TYPES }).notNull(),
		width: integer('width').notNull().default(4),
	},
	(table) => [
		check(
			'chk_dashboard_widgets_metric_type',
			sql`${table.metricType} in (${sql.raw(METRIC_TYPE_IN_LIST)})`
		),
		check(
			'chk_dashboard_widgets_widget_type',
			sql`${table.widgetType} in (${sql.raw(WIDGET_TYPE_IN_LIST)})`
		),
		// DB-level integrity guard: reject malformed JSON in the json-mode `options` column.
		// json_valid() returns NULL for NULL input, so the CHECK still permits NULL values.
		check('chk_dashboard_widgets_options_json', sql`json_valid(${table.options})`),
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
