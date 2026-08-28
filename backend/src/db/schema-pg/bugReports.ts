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
		/**
		 * The report that supersedes this one, when a correction was filed for it.
		 *
		 * The link is stored on the report being replaced rather than on its replacement so the
		 * default inbox listing can leave a superseded report out with a null check rather than a
		 * subquery. The other direction is read back by looking this column up against the ids on
		 * the page, which is how a report knows to say which ones it replaces. Not a self-join:
		 * two reports can be replaced by the same correction, so a join would return that
		 * correction once per report it replaced and make a page longer than its page size.
		 *
		 * onDelete 'set null' matches the userId column above: reports are retained indefinitely and
		 * closed by status rather than deleted, so this only ever fires if a row is removed outside
		 * the API, and losing the link is a better outcome there than losing the original report.
		 */
		supersededById: integer('superseded_by_id'),
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
			sql`${table.status} in (${sql.raw(BUG_REPORT_STATUS_IN_LIST)})`,
		),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_bug_reports_user_id_users',
		}).onDelete('set null'),
		index('idx_bug_reports_user_id').on(table.userId),
		index('idx_bug_reports_status').on(table.status),
		foreignKey({
			columns: [table.supersededById],
			foreignColumns: [table.id],
			name: 'fk_bug_reports_superseded_by_id',
		}).onDelete('set null'),
		index('idx_bug_reports_created_at').on(table.createdAt),
		index('idx_bug_reports_superseded_by_id').on(table.supersededById),
	],
);

export { bugReports };
