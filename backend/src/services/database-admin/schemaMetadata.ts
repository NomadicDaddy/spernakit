import type { getRawClient } from './rawClient.ts';

const SAFE_IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

interface TableMetadata {
	columnCount: number;
	rowCount: number;
	tableName: string;
}

interface ColumnInfo {
	defaultValue: null | string;
	isPrimaryKey: boolean;
	name: string;
	notnull: boolean;
	type: string;
}

interface ForeignKeyInfo {
	sourceColumn: string;
	targetColumn: string;
	targetTable: string;
}

interface IndexInfo {
	columns: string[];
	indexName: string;
	isUnique: boolean;
}

interface TableDetails {
	columns: ColumnInfo[];
	foreignKeys: ForeignKeyInfo[];
	indexes: IndexInfo[];
	tableName: string;
}

type RawClient = ReturnType<typeof getRawClient>;

function assertSafeIdentifier(name: string, label: string): void {
	if (!SAFE_IDENTIFIER.test(name)) {
		throw new Error(`Unsafe ${label} name rejected: ${name}`);
	}
}

function fetchColumns(raw: RawClient, tableName: string): ColumnInfo[] {
	const rawColumns = raw.prepare(`PRAGMA table_info('${tableName}')`).all() as {
		cid: number;
		dflt_value: null | string;
		name: string;
		notnull: number;
		pk: number;
		type: string;
	}[];

	return rawColumns.map((column) => ({
		defaultValue: column.dflt_value,
		isPrimaryKey: column.pk > 0,
		name: column.name,
		notnull: column.notnull === 1,
		type: column.type,
	}));
}

function fetchForeignKeys(raw: RawClient, tableName: string): ForeignKeyInfo[] {
	const rawForeignKeys = raw.prepare(`PRAGMA foreign_key_list('${tableName}')`).all() as {
		from: string;
		id: number;
		seq: number;
		table: string;
		to: string;
	}[];

	return rawForeignKeys.map((foreignKey) => ({
		sourceColumn: foreignKey.from,
		targetColumn: foreignKey.to,
		targetTable: foreignKey.table,
	}));
}

function fetchIndexes(raw: RawClient, tableName: string): IndexInfo[] {
	const rawIndexes = raw.prepare(`PRAGMA index_list('${tableName}')`).all() as {
		name: string;
		origin: string;
		partial: number;
		seq: number;
		unique: number;
	}[];

	return rawIndexes.map((index) => {
		assertSafeIdentifier(index.name, 'index');
		const indexColumns = raw.prepare(`PRAGMA index_info('${index.name}')`).all() as {
			cid: number;
			name: string;
			seqno: number;
		}[];

		return {
			columns: indexColumns.map((column) => column.name),
			indexName: index.name,
			isUnique: index.unique === 1,
		};
	});
}

export { assertSafeIdentifier, fetchColumns, fetchForeignKeys, fetchIndexes };
export type { ColumnInfo, ForeignKeyInfo, IndexInfo, TableDetails, TableMetadata };
