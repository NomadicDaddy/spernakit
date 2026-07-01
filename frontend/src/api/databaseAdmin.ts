import type { DataResponse, PaginatedResponse } from './types';

import { apiClient } from './client';
import { buildQueryParams } from './requestHelpers';

// ── Types ────────────────────────────────────────────────────────────────────

/** Metadata for a database table. */
interface TableMetadata {
	columnCount: number;
	rowCount: number;
	tableName: string;
}

/** Column information from schema introspection. */
interface ColumnInfo {
	defaultValue: null | string;
	isPrimaryKey: boolean;
	name: string;
	notnull: boolean;
	type: string;
}

/** Foreign key relationship between tables. */
interface ForeignKeyInfo {
	sourceColumn: string;
	targetColumn: string;
	targetTable: string;
}

/** Index metadata for a table. */
interface IndexInfo {
	columns: string[];
	indexName: string;
	isUnique: boolean;
}

/** Detailed table metadata including columns, FKs, and indexes. */
interface TableDetails {
	columns: ColumnInfo[];
	foreignKeys: ForeignKeyInfo[];
	indexes: IndexInfo[];
	tableName: string;
}

/** FK relationship with source table for ERD rendering. */
interface Relationship extends ForeignKeyInfo {
	sourceTable: string;
}

/** Safe mode state. */
interface SafeModeState {
	enabled: boolean;
}

/** Result of a SQL query execution. */
interface QueryResult {
	columns: string[];
	rowCount: number;
	rows: Record<string, unknown>[];
}

// ── API Functions ────────────────────────────────────────────────────────────

/** Fetch all tables with metadata. */
function getSchema(): Promise<DataResponse<TableMetadata[]>> {
	return apiClient.get<DataResponse<TableMetadata[]>>('/database-admin/schema');
}

/** Fetch detailed metadata for a specific table. */
function getTableDetails(tableName: string): Promise<DataResponse<TableDetails>> {
	return apiClient.get<DataResponse<TableDetails>>(`/database-admin/schema/${tableName}`);
}

/** Fetch all FK relationships for ERD rendering. */
function getRelationships(): Promise<DataResponse<Relationship[]>> {
	return apiClient.get<DataResponse<Relationship[]>>('/database-admin/schema/relationships');
}

/** Fetch paginated data from a table. */
function getTableData(
	tableName: string,
	params?: { includeDeleted?: string; limit?: string; page?: string }
): Promise<PaginatedResponse<Record<string, unknown>>> {
	const filtered = buildQueryParams(params);
	return apiClient.get<PaginatedResponse<Record<string, unknown>>>(
		`/database-admin/data/${tableName}`,
		{ ...(filtered ? { params: filtered } : {}) }
	);
}

/** Insert a new row into a table. */
function insertRow(
	tableName: string,
	values: Record<string, unknown>
): Promise<DataResponse<Record<string, unknown>>> {
	return apiClient.post<DataResponse<Record<string, unknown>>>(
		`/database-admin/data/${tableName}`,
		{ body: values }
	);
}

/** Update a row by primary key. */
function updateRow(
	tableName: string,
	rowId: number,
	values: Record<string, unknown>
): Promise<DataResponse<Record<string, unknown>>> {
	return apiClient.put<DataResponse<Record<string, unknown>>>(
		`/database-admin/data/${tableName}/${rowId}`,
		{ body: values }
	);
}

/** Delete a row by primary key. */
function deleteTableRow(tableName: string, rowId: number): Promise<DataResponse<null>> {
	return apiClient.delete<DataResponse<null>>(`/database-admin/data/${tableName}/${rowId}`);
}

/** Execute a read-only SELECT query. */
function executeQuery(sql: string): Promise<DataResponse<QueryResult>> {
	return apiClient.post<DataResponse<QueryResult>>('/database-admin/query', {
		body: { sql },
	});
}

/** Get current safe mode state. */
function getSafeMode(): Promise<DataResponse<SafeModeState>> {
	return apiClient.get<DataResponse<SafeModeState>>('/database-admin/safe-mode');
}

/** Toggle safe mode. */
function setSafeMode(enabled: boolean): Promise<DataResponse<null>> {
	return apiClient.put<DataResponse<null>>('/database-admin/safe-mode', {
		body: { enabled },
	});
}

export type { ColumnInfo, Relationship, TableMetadata };
export {
	deleteTableRow,
	executeQuery,
	getRelationships,
	getSafeMode,
	getSchema,
	getTableData,
	getTableDetails,
	insertRow,
	setSafeMode,
	updateRow,
};
