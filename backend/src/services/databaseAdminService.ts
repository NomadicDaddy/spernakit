/**
 * Database Admin Service — Facade.
 *
 * Re-exports public API from the database-admin/ subdirectory.
 * No business logic belongs in this file.
 */
export type {
	DataRow,
	DeleteResult,
	InsertResult,
	UpdateResult,
} from './database-admin/dataOperations.ts';
export { deleteRow, getTableData, insertRow, updateRow } from './database-admin/dataOperations.ts';
export type { QueryResult } from './database-admin/queryExecutor.ts';
export { executeReadOnlyQuery } from './database-admin/queryExecutor.ts';
export { closeReadOnlyClient, PostgreSqlNotSupportedError } from './database-admin/rawClient.ts';
export { redactRow } from './database-admin/redaction.ts';
export { getSafeMode, setSafeMode } from './database-admin/safeModeManager.ts';
export type {
	ColumnInfo,
	ForeignKeyInfo,
	IndexInfo,
	TableDetails,
	TableMetadata,
} from './database-admin/schemaIntrospection.ts';
export {
	getAllRelationships,
	getTableDetails,
	listTables,
	validateTableName,
} from './database-admin/schemaIntrospection.ts';
