/**
 * The write side of the audit log: the row an audited action records, and the attribution fields
 * for one written on behalf of an authenticated request. Re-exported by services/auditService.ts,
 * which every caller imports.
 */
import { getDb } from '../../db/index.ts';
import { auditLogs } from '../../db/schema/auditLogs.ts';

interface LogInput {
	action: string;
	details?: unknown;
	entityId?: string;
	entityType?: string;
	/** The real operator when the request ran under an impersonation token; omit otherwise. */
	impersonatedBy?: number;
	ipAddress?: string;
	userId?: number;
	workspaceId?: number;
}

/**
 * Attribution fields for an explicit audit row written on behalf of an authenticated request. Use
 * `...actorFields(authUser)` instead of `userId: authUser.id` so a row written while the operator is
 * impersonating someone carries `impersonatedBy` too — the same attribution `auditPlugin` records on
 * the request-level row.
 *
 * @param user - The authenticated principal (`AuthPayload`-shaped: `id`, optional `impersonatedBy`)
 * @param user.id - Account the request ran as
 * @param user.impersonatedBy - Operator behind an impersonation session, if any
 * @returns `userId`, plus `impersonatedBy` only when the session is impersonated
 */
function actorFields(user: { id: number; impersonatedBy?: number | undefined }): {
	impersonatedBy?: number;
	userId: number;
} {
	return {
		userId: user.id,
		...(user.impersonatedBy !== undefined ? { impersonatedBy: user.impersonatedBy } : {}),
	};
}

/**
 * Log an audit event.
 *
 * @param input - Audit event data
 */
function log(input: LogInput): void {
	const db = getDb();
	db.insert(auditLogs)
		.values({
			action: input.action,
			...(input.details !== undefined ? { details: input.details } : {}),
			...(input.entityId !== undefined ? { entityId: input.entityId } : {}),
			...(input.entityType !== undefined ? { entityType: input.entityType } : {}),
			...(input.impersonatedBy !== undefined ? { impersonatedBy: input.impersonatedBy } : {}),
			...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
			...(input.userId !== undefined ? { userId: input.userId } : {}),
			...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
		})
		.run();
}

export { actorFields, log };
