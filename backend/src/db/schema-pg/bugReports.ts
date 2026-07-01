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
import { BUG_REPORT_KINDS, BUG_REPORT_STATUSES } from 'spernakit-shared';

import { users } from './users.ts';

// DB-level domain guards: keep the CHECK lists single-sourced from the shared constants.
const BUG_REPORT_KIND_IN_LIST = BUG_REPORT_KINDS.map((kind) => `'${kind}'`).join(', ');
const BUG_REPORT_STATUS_IN_LIST = BUG_REPORT_STATUSES.map((status) => `'${status}'`).join(', ');

/**
 * Bug reports table (PostgreSQL variant).
 *
 * @see ../schema/bugReports.ts for SQLite variant and full documentation
 */
const bugReports = pgTable(
	'bug_reports',
	{
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		description: text('description').notNull(),
		email: text('email'),
		id: serial('id').primaryKey(),
		kind: text('kind', { enum: BUG_REPORT_KINDS }).notNull().default('bug'),
		metadata: jsonb('metadata').$type<Record<string, unknown>>(),
		status: text('status', { enum: BUG_REPORT_STATUSES }).notNull().default('open'),
		title: text('title').notNull(),
		updatedAt: timestamp('updated_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		userId: integer('user_id'),
	},
	(table) => [
		check('chk_bug_reports_kind', sql`${table.kind} in (${sql.raw(BUG_REPORT_KIND_IN_LIST)})`),
		check(
			'chk_bug_reports_status',
			sql`${table.status} in (${sql.raw(BUG_REPORT_STATUS_IN_LIST)})`
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_bug_reports_user_id_users',
		}).onDelete('set null'),
		index('idx_bug_reports_user_id').on(table.userId),
		index('idx_bug_reports_status').on(table.status),
		index('idx_bug_reports_created_at').on(table.createdAt),
	]
);

export { bugReports };
