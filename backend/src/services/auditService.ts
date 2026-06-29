import { and, count, desc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm';

import { getDb } from '../db/index.ts';
import { auditLogs } from '../db/schema/auditLogs.ts';
import { users } from '../db/schema/users.ts';
import { escapeLikePattern, isDefined, likeEscaped, paginatedQuery } from '../utils/dbHelpers.ts';

interface AuditEntry {
	action: string;
	createdAt: string;
	details: unknown;
	id: number;
	ipAddress: null | string;
	resource: null | string;
	resourceId: null | string;
	userId: null | number;
	username: null | string;
}

interface LogInput {
	action: string;
	details?: unknown;
	entityId?: string;
	entityType?: string;
	ipAddress?: string;
	userId?: number;
	workspaceId?: number;
}

interface QueryParams {
	action?: string;
	dateFrom?: string;
	dateTo?: string;
	limit?: number;
	page?: number;
	search?: string;
	userId?: number;
	workspaceId?: null | number;
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
			...(input.ipAddress !== undefined ? { ipAddress: input.ipAddress } : {}),
			...(input.userId !== undefined ? { userId: input.userId } : {}),
			...(input.workspaceId !== undefined ? { workspaceId: input.workspaceId } : {}),
		})
		.run();
}

/**
 * Query audit logs with pagination and filtering.
 *
 * @param params - Pagination and filter options
 * @returns Paginated audit log entries
 */
function query(params: QueryParams): {
	data: AuditEntry[];
	limit: number;
	page: number;
	total: number;
} {
	const db = getDb();

	const conditions = [];

	if (isDefined(params.workspaceId)) {
		conditions.push(
			or(eq(auditLogs.workspaceId, params.workspaceId), isNull(auditLogs.workspaceId))!
		);
	}
	if (params.userId !== undefined) {
		conditions.push(eq(auditLogs.userId, params.userId));
	}
	if (params.action) {
		conditions.push(likeEscaped(auditLogs.action, `%${escapeLikePattern(params.action)}%`));
	}
	if (params.dateFrom) {
		conditions.push(gte(auditLogs.createdAt, new Date(params.dateFrom)));
	}
	if (params.dateTo) {
		conditions.push(lte(auditLogs.createdAt, new Date(params.dateTo)));
	}
	if (params.search) {
		const searchPattern = `%${escapeLikePattern(params.search)}%`;
		// Search also covers the JSON `details` column so audit-log search matches
		// entity names (e.g., backup target name) captured by the audit plugin from
		// request bodies, not just action strings and entity types.
		conditions.push(
			sql`(${auditLogs.action} LIKE ${searchPattern} ESCAPE '\\' OR ${auditLogs.entityType} LIKE ${searchPattern} ESCAPE '\\' OR ${auditLogs.entityId} LIKE ${searchPattern} ESCAPE '\\' OR ${auditLogs.details} LIKE ${searchPattern} ESCAPE '\\')`
		);
	}

	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

	const result = paginatedQuery(
		params.page,
		params.limit,
		(limitNum, offset) => {
			const rows = db
				.select({
					action: auditLogs.action,
					createdAt: auditLogs.createdAt,
					details: auditLogs.details,
					entityId: auditLogs.entityId,
					entityType: auditLogs.entityType,
					id: auditLogs.id,
					ipAddress: auditLogs.ipAddress,
					userId: auditLogs.userId,
					username: users.username,
				})
				.from(auditLogs)
				.leftJoin(users, eq(auditLogs.userId, users.id))
				.where(whereClause)
				.orderBy(desc(auditLogs.createdAt))
				.limit(limitNum)
				.offset(offset)
				.all();

			return rows.map((row) => ({
				action: row.action,
				createdAt: row.createdAt.toISOString(),
				details: row.details,
				id: row.id,
				ipAddress: row.ipAddress,
				resource: row.entityType,
				resourceId: row.entityId,
				userId: row.userId,
				username: row.username,
			}));
		},
		() => db.select({ count: count() }).from(auditLogs).where(whereClause).get()
	);

	return result;
}

/**
 * Get total count of audit log entries, optionally filtered by workspace.
 *
 * @param workspaceId - Optional workspace ID to filter by
 * @returns Total count of audit log entries
 */
function getTotalCount(workspaceId?: null | number): number {
	const db = getDb();
	const conditions = [];
	if (isDefined(workspaceId)) {
		conditions.push(or(eq(auditLogs.workspaceId, workspaceId), isNull(auditLogs.workspaceId))!);
	}
	const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
	const result = db.select({ count: count() }).from(auditLogs).where(whereClause).get();
	return result?.count ?? 0;
}

export { getTotalCount, log, query };
