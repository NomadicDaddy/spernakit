import { sql } from 'drizzle-orm';
import { check, foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { users } from './users.ts';
import { workspaces } from './workspaces.ts';

/**
 * Security and compliance audit trail — who did what, when.
 *
 * Purpose: Accountability and forensics. Records security-relevant mutations (login, role change,
 * resource creation/deletion, permission grants) so administrators can investigate incidents,
 * satisfy compliance requirements, and reconstruct timelines. This table is NOT for product
 * analytics — see {@link businessEvents} for feature-usage and conversion tracking.
 *
 * Intentional omissions:
 * - No soft delete: Audit logs are immutable compliance records — deletion would violate audit integrity.
 * - No createdBy/updatedBy: The userId field already captures who performed the audited action.
 *   These are append-only records that are never updated after creation.
 *
 * Foreign key cascade behavior:
 * - userId: onDelete 'set null' - Audit logs must persist for compliance even when users
 *   are deleted. The userId is nullified but the audit record remains for forensic analysis.
 * - workspaceId: onDelete 'set null' - Logs persist after workspace deletion for audit trail.
 * - impersonatedBy: onDelete 'set null' - Same reasoning as userId. When a SYSOP acts through
 *   `POST /users/:id/impersonate`, `userId` is the impersonated account (the session the request
 *   ran as) and `impersonatedBy` is the real operator. NULL on every row that was not impersonated.
 */
const auditLogs = sqliteTable(
	'audit_logs',
	{
		action: text('action').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		details: text('details', { mode: 'json' }),
		entityId: text('entity_id'),
		entityType: text('entity_type'),
		id: integer('id').primaryKey({ autoIncrement: true }),
		impersonatedBy: integer('impersonated_by'),
		ipAddress: text('ip_address'),
		userId: integer('user_id'),
		workspaceId: integer('workspace_id'),
	},
	(table) => [
		// DB-level integrity guard: reject malformed JSON in the json-mode `details` column.
		// json_valid() returns NULL for NULL input, so the CHECK still permits NULL values.
		check('chk_audit_logs_details_json', sql`json_valid(${table.details})`),
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_audit_logs_user_id_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.impersonatedBy],
			foreignColumns: [users.id],
			name: 'fk_audit_logs_impersonated_by_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.workspaceId],
			foreignColumns: [workspaces.id],
			name: 'fk_audit_logs_workspace_id_workspaces',
		}).onDelete('set null'),
		index('idx_audit_logs_user_id').on(table.userId),
		index('idx_audit_logs_impersonated_by').on(table.impersonatedBy),
		index('idx_audit_logs_action').on(table.action),
		index('idx_audit_logs_entity').on(table.entityType, table.entityId),
		index('idx_audit_logs_created_at').on(table.createdAt),
		index('idx_audit_logs_workspace_id').on(table.workspaceId),
		index('idx_audit_logs_workspace_created').on(table.workspaceId, table.createdAt),
	],
);

export { auditLogs };
