import { sql } from 'drizzle-orm';
import {
	check,
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';
import { EVENT_CATEGORIES } from 'spernakit-shared';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

const EVENT_CATEGORY_IN_LIST = EVENT_CATEGORIES.map((category) => `'${category}'`).join(', ');

/**
 * Business events table (PostgreSQL variant).
 *
 * @see ../schema/businessEvents.ts for SQLite variant and full documentation
 */
const businessEvents = pgTable(
	'business_events',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		eventCategory: text('event_category', { enum: EVENT_CATEGORIES }).notNull(),
		eventName: text('event_name').notNull(),
		id: serial('id').primaryKey(),
		metadata: jsonb('metadata').$type<Record<string, unknown>>(),
		userId: integer('user_id'),
		workspaceId: integer('workspace_id'),
	},
	(table) => [
		check(
			'chk_business_events_event_category',
			sql`${table.eventCategory} in (${sql.raw(EVENT_CATEGORY_IN_LIST)})`
		),
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
