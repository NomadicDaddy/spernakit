import { useQuery } from '@tanstack/react-query';
import { Database, Key, Search } from 'lucide-react';
import { useDeferredValue, useState } from 'react';

import type { ColumnInfo, TableMetadata } from '@/api/databaseAdmin';

import { getSchema, getTableDetails } from '@/api/databaseAdmin';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';

interface SchemaExplorerPanelProps {
	onSelectTable?: ((tableName: string) => void) | undefined;
	selectedTable?: string | undefined;
}

function SchemaExplorerPanel({ onSelectTable, selectedTable }: SchemaExplorerPanelProps) {
	const [search, setSearch] = useState('');

	const { data: schemaResponse, isLoading: isLoadingSchema } = useQuery({
		queryFn: getSchema,
		queryKey: ['database-admin', 'schema'],
		staleTime: STALE_TIME_SHORT,
	});

	const { data: detailsResponse, isLoading: isLoadingDetails } = useQuery({
		enabled: !!selectedTable,
		queryFn: () => getTableDetails(selectedTable!),
		queryKey: ['database-admin', 'table', selectedTable],
		staleTime: STALE_TIME_SHORT,
	});

	const tables = schemaResponse?.data ?? [];
	const details = detailsResponse?.data;

	const deferredSearch = useDeferredValue(search);
	const filteredTables = deferredSearch
		? tables.filter((t) => t.tableName.toLowerCase().includes(deferredSearch.toLowerCase()))
		: tables;

	return (
		<div className="grid gap-4 md:grid-cols-2">
			{/* Table List */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="flex items-center gap-2 text-base">
						<Database aria-hidden="true" className="h-4 w-4" />
						Tables ({tables.length})
					</CardTitle>
					<div className="relative">
						<Search
							aria-hidden="true"
							className="text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4"
						/>
						<Input
							aria-label="Filter tables"
							autoComplete="off"
							className="pl-8"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Filter tables…"
							value={search}
						/>
					</div>
				</CardHeader>
				<CardContent className="max-h-[500px] space-y-1 overflow-y-auto">
					{isLoadingSchema ? (
						<ContentListSkeleton lineCount={8} lineHeight="h-10" spacing="space-y-2" />
					) : (
						filteredTables.map((table) => (
							<TableRow
								isSelected={selectedTable === table.tableName}
								key={table.tableName}
								onSelect={() => onSelectTable?.(table.tableName)}
								table={table}
							/>
						))
					)}
					{!isLoadingSchema && filteredTables.length === 0 && (
						<p className="text-muted-foreground py-4 text-center text-sm">
							No tables found
						</p>
					)}
				</CardContent>
			</Card>

			{/* Column Details */}
			<Card>
				<CardHeader className="pb-3">
					<CardTitle className="text-base">
						{selectedTable ? `Columns: ${selectedTable}` : 'Select a table'}
					</CardTitle>
				</CardHeader>
				<CardContent className="max-h-[500px] overflow-y-auto">
					{!selectedTable && (
						<p className="text-muted-foreground py-8 text-center text-sm">
							Click a table to view its columns
						</p>
					)}
					{selectedTable && isLoadingDetails && (
						<ContentListSkeleton lineCount={5} lineHeight="h-12" spacing="space-y-2" />
					)}
					{details && (
						<ColumnList columns={details.columns} foreignKeys={details.foreignKeys} />
					)}
				</CardContent>
			</Card>
		</div>
	);
}

function TableRow({
	isSelected,
	onSelect,
	table,
}: {
	isSelected: boolean;
	onSelect: () => void;
	table: TableMetadata;
}) {
	return (
		<button
			className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
				isSelected ? 'bg-primary/10 text-primary' : 'hover:bg-muted'
			}`}
			onClick={onSelect}
			type="button">
			<span className="font-medium">{table.tableName}</span>
			<div className="flex gap-2">
				<Badge variant="secondary">{table.columnCount} cols</Badge>
				<Badge variant="outline">{table.rowCount} rows</Badge>
			</div>
		</button>
	);
}

function ColumnList({
	columns,
	foreignKeys,
}: {
	columns: ColumnInfo[];
	foreignKeys: { sourceColumn: string; targetColumn: string; targetTable: string }[];
}) {
	const fkMap = new Map(foreignKeys.map((fk) => [fk.sourceColumn, fk]));
	return (
		<div className="space-y-2">
			{columns.map((col) => (
				<ColumnRow column={col} fk={fkMap.get(col.name)} key={col.name} />
			))}
		</div>
	);
}

function ColumnRow({
	column,
	fk,
}: {
	column: ColumnInfo;
	fk: { sourceColumn: string; targetColumn: string; targetTable: string } | undefined;
}) {
	return (
		<div className="flex items-center justify-between rounded-md border px-3 py-2">
			<div className="flex items-center gap-2">
				{column.isPrimaryKey && (
					<Key aria-hidden="true" className="text-primary h-3.5 w-3.5" />
				)}
				<span className="text-sm font-medium">{column.name}</span>
				<span className="text-muted-foreground text-xs">{column.type}</span>
			</div>
			<div className="flex items-center gap-1.5">
				{column.notnull && (
					<Badge className="text-[10px]" variant="destructive">
						NOT NULL
					</Badge>
				)}
				{column.defaultValue !== null && (
					<Badge className="text-[10px]" variant="secondary">
						{column.defaultValue}
					</Badge>
				)}
				{fk && (
					<Badge className="text-[10px]" variant="outline">
						FK → {fk.targetTable}.{fk.targetColumn}
					</Badge>
				)}
			</div>
		</div>
	);
}

export { SchemaExplorerPanel };
