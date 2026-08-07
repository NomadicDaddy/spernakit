export interface EnumColumn {
	columnName: string;
	line: number;
}

export interface SchemaTable {
	source: string;
	startLine: number;
	tableName: string;
}
