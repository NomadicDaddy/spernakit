import { useQuery } from '@tanstack/react-query';
import { Eye } from 'lucide-react';
import { useState } from 'react';

import { getSafeMode, getSchema, getTableData, getTableDetails } from '@/api/databaseAdmin';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { useDataViewerMutations } from '@/hooks/settings/useDataViewerMutations';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';

import { CreateRowDialog } from './CreateRowDialog';
import { DataViewerPagination } from './DataViewerPagination';
import { DataViewerTable, type EditingCell } from './DataViewerTable';
import { DataViewerTablePicker } from './DataViewerTablePicker';
import { DataViewerToolbar } from './DataViewerToolbar';

interface DataViewerPanelProps {
	onSelectTable?: ((tableName: string) => void) | undefined;
	tableName?: string | undefined;
}

function DataViewerPanel({ onSelectTable, tableName }: DataViewerPanelProps) {
	const { isSysop } = useAuthorization();
	const { getFilter, setFilters } = useUrlFilters();
	const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [hiddenColumns, setHiddenColumns] = useState<string[]>([]);
	const [prevTableName, setPrevTableName] = useState(tableName);
	// Column names belong to one table. Carrying a hidden `details` across to a table that also
	// has a `details` would silently hide a column the operator never touched here.
	if (tableName !== prevTableName) {
		setPrevTableName(tableName);
		setHiddenColumns([]);
	}
	const [deleteTarget, setDeleteTarget] = useState<{
		hasIsDeleted: boolean;
		rowId: number;
	} | null>(null);
	const limit = 20;
	const parsedPage = Number(getFilter('dataPage', '1'));
	const page = Number.isFinite(parsedPage) ? Math.max(1, Math.floor(parsedPage)) : 1;
	const includeDeleted = getFilter('includeDeleted', 'false') === 'true';
	const setPage = (nextPage: number) => {
		setFilters(
			(params) => {
				if (nextPage <= 1) {
					params.delete('dataPage');
				} else {
					params.set('dataPage', String(nextPage));
				}
			},
			{ replace: false },
		);
	};
	const setIncludeDeleted = (checked: boolean) => {
		setFilters(
			(params) => {
				if (checked) {
					params.set('includeDeleted', 'true');
				} else {
					params.delete('includeDeleted');
				}
				params.delete('dataPage');
			},
			{ replace: false },
		);
	};

	// Already in the cache under this key whenever the operator arrived through the Schema tab or
	// the ERD. Fetched unconditionally rather than only for the empty state, because the toolbar
	// picker needs the same list once a table IS selected — that is the whole point of it being
	// able to switch — and a deep link to `?table=users` never passes through the empty state.
	const { data: schemaResponse } = useQuery({
		queryFn: getSchema,
		queryKey: ['database-admin', 'schema'],
		staleTime: STALE_TIME_SHORT,
	});
	const tableNames = (schemaResponse?.data ?? []).map((table) => table.tableName);

	const { data: safeModeResponse } = useQuery({
		queryFn: getSafeMode,
		queryKey: ['database-admin', 'safe-mode'],
		staleTime: 10_000,
	});

	const safeMode = safeModeResponse?.data.enabled ?? true;
	const canMutate = isSysop() && !safeMode;

	const { data: dataResponse, isLoading } = useQuery({
		enabled: !!tableName,
		queryFn: () =>
			getTableData(tableName!, {
				includeDeleted: includeDeleted ? 'true' : 'false',
				limit: String(limit),
				page: String(page),
			}),
		queryKey: ['database-admin', 'data', tableName, page, limit, includeDeleted],
		staleTime: 10_000,
	});

	const { data: detailsResponse } = useQuery({
		enabled: !!tableName,
		queryFn: () => getTableDetails(tableName!),
		queryKey: ['database-admin', 'table', tableName],
		staleTime: STALE_TIME_SHORT,
	});

	const columns = detailsResponse?.data.columns ?? [];
	const hasIsDeleted = columns.some((c) => c.name === 'is_deleted');

	const { deleteMutation, insertMutation, safeModeToggle, updateMutation } =
		useDataViewerMutations({
			onDeleteSuccess: () => setDeleteTarget(null),
			onInsertSuccess: () => setCreateDialogOpen(false),
			onUpdateSuccess: () => setEditingCell(null),
			tableName,
		});

	/*
	 * A dead end that told the operator to leave the panel, on a surface where the table is already
	 * a URL parameter. The picker is the same query the schema explorer reads, already cached, so
	 * the panel can be entered directly instead of round-tripping through the Schema tab.
	 */
	if (!tableName) {
		return (
			<Card>
				<CardContent>
					<EmptyState
						action={
							<DataViewerTablePicker
								onSelect={(value) => onSelectTable?.(value)}
								tableNames={tableNames}
							/>
						}
						description="Choose a table to browse its rows."
						icon={Eye}
						title="No table selected"
					/>
				</CardContent>
			</Card>
		);
	}

	const rows = dataResponse?.data ?? [];
	const total = dataResponse?.total ?? 0;
	const totalPages = Math.ceil(total / limit);
	const firstRow = rows[0];
	const columnNames = firstRow ? Object.keys(firstRow) : columns.map((c) => c.name);
	const visibleColumnNames = columnNames.filter((col) => !hiddenColumns.includes(col));

	return (
		<div className="space-y-4">
			<DataViewerToolbar
				actions={{
					onCreateClick: () => setCreateDialogOpen(true),
					onIncludeDeletedChange: setIncludeDeleted,
					onSafeModeToggle: (checked) => safeModeToggle.mutate(checked),
					onSelectTable: (next) => onSelectTable?.(next),
					onToggleColumn: (column, visible) =>
						setHiddenColumns((prev) =>
							visible ? prev.filter((c) => c !== column) : [...prev, column],
						),
				}}
				columnNames={columnNames}
				rows={rows}
				state={{
					hasIsDeleted,
					hiddenColumns,
					includeDeleted,
					isSysop: isSysop(),
					safeMode,
					safeModeTogglePending: safeModeToggle.isPending,
				}}
				tableName={tableName}
				tableNames={tableNames}
			/>

			<DataViewerTable
				actions={{
					onCellDoubleClick: (rowId, column, value) =>
						setEditingCell({ column, rowId, value }),
					onDeleteClick: (rowId, hasIsDeletedCol) =>
						setDeleteTarget({ hasIsDeleted: hasIsDeletedCol, rowId }),
					onEditCancel: () => setEditingCell(null),
					onEditCommit: (rowId, column, value) =>
						updateMutation.mutate({ column, rowId, value }),
				}}
				columnNames={visibleColumnNames}
				editingCell={editingCell}
				footer={
					<DataViewerPagination
						onPageChange={setPage}
						page={page}
						total={total}
						totalPages={totalPages}
					/>
				}
				rows={rows}
				state={{
					canMutate,
					hasIsDeleted,
					isLoading,
				}}
			/>

			<ConfirmAlertDialog
				confirmText="Delete"
				description={
					deleteTarget?.hasIsDeleted
						? 'This row will be soft-deleted (is_deleted set to 1). It can be recovered.'
						: 'This row will be permanently deleted. This action cannot be undone.'
				}
				isOpen={deleteTarget !== null}
				isPending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) {
						deleteMutation.mutate(deleteTarget.rowId);
					}
				}}
				onOpenChange={() => setDeleteTarget(null)}
				title="Confirm Delete"
				variant="destructive"
			/>

			<CreateRowDialog
				columns={columns}
				onClose={() => setCreateDialogOpen(false)}
				onSubmit={(values) => insertMutation.mutate(values)}
				open={createDialogOpen}
				pending={insertMutation.isPending}
			/>
		</div>
	);
}

export { DataViewerPanel };
