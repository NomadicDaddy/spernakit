import { and, count, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { alias } from 'drizzle-orm/sqlite-core';

import { getDb } from '../db/index.ts';
import { auditLogs } from '../db/schema/auditLogs.ts';
import { users } from '../db/schema/users.ts';
import { escapeLikePattern, isDefined, likeEscaped, paginatedQuery } from '../utils/dbHelpers.ts';
import { resolveSort } from '../utils/sorting.ts';

/**
 * Columns the audit log may be sorted by, keyed as the client sends them.
 *
 * The keys are the table's own column ids on /settings/audit-logs, so a header the reader can click
 * and a column the query can order by are the same list by construction. `resource` maps to
 * `entityType` because that is what the API renames it to on the way out.
 */
const AUDIT_SORT_COLUMNS = {
	action: auditLogs.action,
	createdAt: auditLogs.createdAt,
	ipAddress: auditLogs.ipAddress,
	resource: auditLogs.entityType,
	username: users.username,
};

/**
 * Second handle on `users` so one query can name both the session the request ran as (`userId`) and
 * the operator behind an impersonated session (`impersonatedBy`). The join is LEFT on both sides:
 * the column is NULL on every row that was not impersonated.
 */
const impersonators = alias(users, 'impersonators');

/**
 * The response status the writer already recorded, read back out of the row.
 *
 * `auditPlugin` stores `details.status` only when the response was 400 or above, so a NULL here is
 * a request that succeeded. The outcome is derived from that one value rather than kept in a column
 * of its own, because a stored copy is a second source of truth and the two can disagree.
 */
const AUDIT_STATUS = sql<null | number>`json_extract(${auditLogs.details}, '$.status')`;

/**
 * The `username` the request body carried, which `auditPlugin` copies into `details.entity`.
 *
 * On a failed sign-in this is the account the caller was trying to reach, and it is the only thing
 * that tells such a row apart from routine unattributed activity, which renders as System. It
 * discloses nothing the caller did not supply, and only ADMIN and above can read this log.
 */
const AUDIT_SUBMITTED_USERNAME = sql<
	null | string
>`json_extract(${auditLogs.details}, '$.entity.username')`;

interface AuditEntry {
	action: string;
	createdAt: string;
	details: unknown;
	id: number;
	impersonatedBy: null | number;
	impersonatorUsername: null | string;
	ipAddress: null | string;
	resource: null | string;
	resourceId: null | string;
	/** The response status, for a request that failed; null for one that succeeded. */
	status: null | number;
	/** The username the request body carried, which is the attempted account on a failed sign-in. */
	submittedUsername: null | string;
	userId: null | number;
	username: null | string;
}

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

interface QueryParams {
	action?: string;
	dateFrom?: string;
	dateTo?: string;
	limit?: number;
	/** `failed` narrows to responses of 400 or above, `succeeded` to everything else. */
	outcome?: 'failed' | 'succeeded';
	page?: number;
	search?: string;
	/** A key of AUDIT_SORT_COLUMNS; anything else falls back to newest first. */
	sortBy?: string;
	/** `asc`, or descending for anything else. */
	sortDir?: string;
	userId?: number;
	workspaceId?: null | number;
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
			or(eq(auditLogs.workspaceId, params.workspaceId), isNull(auditLogs.workspaceId))!,
		);
	}
	if (params.userId !== undefined) {
		conditions.push(eq(auditLogs.userId, params.userId));
	}
	if (params.action) {
		conditions.push(likeEscaped(auditLogs.action, `%${escapeLikePattern(params.action)}%`));
	}
	if (params.outcome === 'failed') {
		conditions.push(sql`coalesce(${AUDIT_STATUS}, 0) >= 400`);
	}
	if (params.outcome === 'succeeded') {
		/*
		 * `coalesce` rather than "IS NULL OR < 400": a top-level OR needs parentheses of its own to
		 * survive being ANDed with the other filters, and a single expression cannot lose them.
		 */
		conditions.push(sql`coalesce(${AUDIT_STATUS}, 0) < 400`);
	}
	if (params.dateFrom) {
		conditions.push(gte(auditLogs.createdAt, new Date(params.dateFrom)));
	}
	if (params.dateTo) {
		conditions.push(lte(auditLogs.createdAt, new Date(params.dateTo)));
	}
	if (params.search) {
		const searchPattern = `%${escapeLikePattern(params.search)}%`;
		// Search covers the JSON `details` column so audit-log search matches entity
		// names (e.g., backup target name) captured by the audit plugin from request
		// bodies, not just action strings and entity types.
		//
		// The actor is matched through a subquery rather than the leftJoin the row
		// select uses, because the companion count query in paginatedQuery selects
		// from auditLogs alone and would not resolve a joined column. Without this,
		// searching a username returned only the rows that happened to carry it
		// inside `details` (the audit plugin copies a submitted `username` field
		// there) while excluding every row genuinely attributed to that account.
		const actorMatches = db
			.select({ id: users.id })
			.from(users)
			.where(likeEscaped(users.username, searchPattern));
		conditions.push(
			or(
				likeEscaped(auditLogs.action, searchPattern),
				likeEscaped(auditLogs.entityType, searchPattern),
				likeEscaped(auditLogs.entityId, searchPattern),
				likeEscaped(auditLogs.details, searchPattern),
				inArray(auditLogs.userId, actorMatches),
				inArray(auditLogs.impersonatedBy, actorMatches),
			)!,
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
					impersonatedBy: auditLogs.impersonatedBy,
					impersonatorUsername: impersonators.username,
					ipAddress: auditLogs.ipAddress,
					status: AUDIT_STATUS,
					submittedUsername: AUDIT_SUBMITTED_USERNAME,
					userId: auditLogs.userId,
					username: users.username,
				})
				.from(auditLogs)
				.leftJoin(users, eq(auditLogs.userId, users.id))
				.leftJoin(impersonators, eq(auditLogs.impersonatedBy, impersonators.id))
				.where(whereClause)
				/*
				 * `id` as the tiebreaker, always — `resolveSort` returns it with the sort. Pagination
				 * here is LIMIT/OFFSET, so an order that leaves ties unresolved lets SQLite return two
				 * equal rows in either sequence between one page request and the next — the same
				 * record appearing on page 1 and page 2 while another is never returned at all.
				 * Sorting by `username` over 179 rows written by two accounts is that case almost
				 * everywhere.
				 */
				.orderBy(
					...resolveSort(
						AUDIT_SORT_COLUMNS,
						auditLogs.createdAt,
						params.sortBy,
						params.sortDir,
						auditLogs.id,
					),
				)
				.limit(limitNum)
				.offset(offset)
				.all();

			return rows.map((row) => ({
				action: row.action,
				createdAt: row.createdAt.toISOString(),
				details: row.details,
				id: row.id,
				impersonatedBy: row.impersonatedBy,
				impersonatorUsername: row.impersonatorUsername,
				ipAddress: row.ipAddress,
				resource: row.entityType,
				resourceId: row.entityId,
				status: row.status,
				submittedUsername: row.submittedUsername,
				userId: row.userId,
				username: row.username,
			}));
		},
		() => db.select({ count: count() }).from(auditLogs).where(whereClause).get(),
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

export { actorFields, getTotalCount, log, query };
