import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { EVENT_CATEGORIES } from 'spernakit-shared';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

const EVENT_CATEGORY_IN_LIST = EVENT_CATEGORIES.map((category) => `'${category}'`).join(', ');

/**
 * Product analytics — feature usage, conversions, and business intelligence metrics.
 *
 * Purpose: Business intelligence and product insights. Tracks what users do with the product
 * (page views, feature interactions, conversion milestones) so dashboards and reports can surface
 * adoption trends, usage patterns, and funnel metrics. This table is NOT for security or compliance
 * auditing — see {@link auditLogs} for the immutable accountability trail.
 *
 * Intentional omissions:
 * - No soft delete: Analytics events are immutable — deletion handled by retention policy.
 * - No createdBy/updatedBy: The userId field captures who triggered the event.
 *   These are append-only records that are never updated after creation.
 *
 * Event categories:
 * - user_action: Login, logout, profile update, password change
 * - conversion: Registration, workspace creation, file upload
 * - feature_usage: Page view, feature interaction, API endpoint call
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'set null' - Events remain for analytics even if user is deleted.
 * - workspaceId: onDelete 'set null' - Events remain for analytics even if workspace is deleted.
 */
const businessEvents = sqliteTable(
	'business_events',
	{
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		eventCategory: text('event_category', { enum: EVENT_CATEGORIES }).notNull(),
		eventName: text('event_name').notNull(),
		id: integer('id').primaryKey({ autoIncrement: true }),
		metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>(),
		userId: integer('user_id'),
		workspaceId: integer('workspace_id'),
	},
	(table) => [
		check(
			'chk_business_events_event_category',
			sql`${table.eventCategory} in (${sql.raw(EVENT_CATEGORY_IN_LIST)})`
		),
		// DB-level integrity guard: reject malformed JSON in the json-mode `metadata` column.
		// json_valid() returns NULL for NULL input, so the CHECK still permits NULL values.
		check('chk_business_events_metadata_json', sql`json_valid(${table.metadata})`),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_business_events_user_id_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: 'fk_business_events_workspace_id_workspaces',
		}).onDelete('set null'),
		index('idx_business_events_category_created').on(table.eventCategory, table.createdAt),
		index('idx_business_events_name_created').on(table.eventName, table.createdAt),
		index('idx_business_events_user_id').on(table.userId),
		index('idx_business_events_user_created').on(table.userId, table.createdAt),
		index('idx_business_events_created_at').on(table.createdAt),
	]
);

export { businessEvents };
