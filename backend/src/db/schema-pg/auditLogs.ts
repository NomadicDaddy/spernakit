import {
	foreignKey,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

/**
 * Audit logs table (PostgreSQL variant).
 *
 * @see ../schema/auditLogs.ts for SQLite variant and full documentation
 */
const auditLogs = pgTable(
	'audit_logs',
	{
		action: text('action').notNull(),
		createdAt: timestamp('created_at', { mode: 'date' })
			.notNull()
			.$defaultFn(() => new Date()),
		details: jsonb('details'),
		entityId: text('entity_id'),
		entityType: text('entity_type'),
		id: serial('id').primaryKey(),
		ipAddress: text('ip_address'),
		userId: integer('user_id'),
		workspaceId: integer('workspace_id'),
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_audit_logs_user_id_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: 'fk_audit_logs_workspace_id_workspaces',
		}).onDelete('set null'),
		index('idx_audit_logs_user_id').on(table.userId),
		index('idx_audit_logs_action').on(table.action),
		index('idx_audit_logs_entity').on(table.entityType, table.entityId),
		index('idx_audit_logs_created_at').on(table.createdAt),
		index('idx_audit_logs_workspace_id').on(table.workspaceId),
		index('idx_audit_logs_workspace_created').on(table.workspaceId, table.createdAt),
	]
);

export { auditLogs };
