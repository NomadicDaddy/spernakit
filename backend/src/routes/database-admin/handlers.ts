import type { assertUser } from '../../guards/role.ts';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT } from '../../constants/pagination.ts';
import { log as logAudit } from '../../services/auditService.ts';
import {
	deleteRow,
	executeReadOnlyQuery,
	getAllRelationships,
	getSafeMode,
	getTableData,
	getTableDetails,
	insertRow,
	listTables,
	redactRow,
	updateRow,
	validateTableName,
} from '../../services/databaseAdminService.ts';
import { dataResponse, paginatedResponse, successResponse } from '../../utils/apiResponse.ts';
import { badRequestError, forbiddenError, notFoundError } from '../../utils/errorResponse.ts';

/* ------------------------------------------------------------------ */
/*  Shared guards                                                      */
/* ------------------------------------------------------------------ */

/** Check safe mode and table name validity. Returns an error response or null if valid. */
function guardMutationRequest(
	tableName: string,
	set: { status?: number | string }
): null | ReturnType<typeof forbiddenError> {
	if (getSafeMode()) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError(
			'Safe mode is enabled. Disable safe mode before performing mutations.'
		);
	}

	if (!validateTableName(tableName)) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Table');
	}

	return null;
}

/* ------------------------------------------------------------------ */
/*  Extracted handlers                                                 */
/* ------------------------------------------------------------------ */

/** Handle GET /schema — list all tables with metadata. */
function handleListSchema() {
	const tables = listTables();
	return dataResponse(tables);
}

/** Handle GET /schema/relationships — all FK relationships for ERD. */
function handleGetRelationships() {
	const relationships = getAllRelationships();
	return dataResponse(relationships);
}

/** Handle GET /schema/:tableName — detailed table metadata. */
function handleGetTableDetails({
	params,
	set,
}: {
	params: { tableName: string };
	set: { status?: number | string };
}) {
	const details = getTableDetails(params.tableName);
	if (!details) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Table');
	}
	return dataResponse(details);
}

/** Handle GET /data/:tableName — paginated table data. */
function handleGetTableData({
	params,
	query,
	set,
}: {
	params: { tableName: string };
	query: { includeDeleted?: boolean; limit?: number; page?: number };
	set: { status?: number | string };
}) {
	if (!validateTableName(params.tableName)) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Table');
	}

	const result = getTableData({
		...(query.includeDeleted !== undefined ? { includeDeleted: query.includeDeleted } : {}),
		limit: query.limit ?? DEFAULT_PAGE_LIMIT,
		page: query.page ?? DEFAULT_PAGE,
		tableName: params.tableName,
	});

	if (!result) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Table');
	}

	return paginatedResponse(result);
}

/** Handle POST /data/:tableName — insert a row (SYSOP, safe mode check). */
function handleInsertRow({
	body,
	params,
	set,
	user,
}: {
	body: Record<string, unknown>;
	params: { tableName: string };
	set: { status?: number | string };
	user: ReturnType<typeof assertUser>;
}) {
	const guardError = guardMutationRequest(params.tableName, set);
	if (guardError) return guardError;

	const result = insertRow(params.tableName, body);
	if (!result) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Failed to insert row');
	}

	logAudit({
		action: 'database-admin.insert',
		details: { newValues: redactRow(result.newValues), tableName: params.tableName },
		entityId: String(result.rowId),
		entityType: params.tableName,
		userId: user.id,
	});

	return dataResponse(result.newValues);
}

/** Handle PUT /data/:tableName/:rowId — update a row (SYSOP, safe mode check). */
function handleUpdateRow({
	body,
	params,
	set,
	user,
}: {
	body: Record<string, unknown>;
	params: { rowId: number; tableName: string };
	set: { status?: number | string };
	user: ReturnType<typeof assertUser>;
}) {
	const guardError = guardMutationRequest(params.tableName, set);
	if (guardError) return guardError;

	const result = updateRow(params.tableName, params.rowId, body);
	if (!result) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Row');
	}

	logAudit({
		action: 'database-admin.update',
		details: {
			newValues: redactRow(result.newValues),
			oldValues: redactRow(result.oldValues),
			tableName: params.tableName,
		},
		entityId: String(params.rowId),
		entityType: params.tableName,
		userId: user.id,
	});

	return dataResponse(result.newValues);
}

/** Handle DELETE /data/:tableName/:rowId — delete a row (SYSOP, safe mode check). */
function handleDeleteRow({
	params,
	set,
	user,
}: {
	params: { rowId: number; tableName: string };
	set: { status?: number | string };
	user: ReturnType<typeof assertUser>;
}) {
	const guardError = guardMutationRequest(params.tableName, set);
	if (guardError) return guardError;

	const result = deleteRow(params.tableName, params.rowId);
	if (!result) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Row');
	}

	logAudit({
		action: result.softDeleted ? 'database-admin.soft-delete' : 'database-admin.hard-delete',
		details: { deletedValues: redactRow(result.deletedValues), tableName: params.tableName },
		entityId: String(params.rowId),
		entityType: params.tableName,
		userId: user.id,
	});

	return successResponse();
}

/** Handle POST /query — execute a read-only SELECT. */
function handleExecuteQuery({
	body,
	set,
	user,
}: {
	body: { sql: string };
	set: { status?: number | string };
	user: ReturnType<typeof assertUser>;
}) {
	const result = executeReadOnlyQuery(body.sql);

	if (!result.success) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(result.error);
	}

	logAudit({
		action: 'database-admin.query',
		details: { rowCount: result.data.rows.length, sql: body.sql },
		entityType: 'database',
		userId: user.id,
	});

	return dataResponse(result.data);
}

export {
	handleDeleteRow,
	handleExecuteQuery,
	handleGetRelationships,
	handleGetTableData,
	handleGetTableDetails,
	handleInsertRow,
	handleListSchema,
	handleUpdateRow,
};
