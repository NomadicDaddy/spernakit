import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { getSafeMode, getTableData, getTableDetails } from '@/api/databaseAdmin';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { Card, CardContent } from '@/components/ui/card';
import { useDataViewerMutations } from '@/hooks/settings/useDataViewerMutations';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';

import { CreateRowDialog } from './CreateRowDialog';
import { DataViewerPagination } from './DataViewerPagination';
import { DataViewerTable, type EditingCell } from './DataViewerTable';
import { DataViewerToolbar } from './DataViewerToolbar';

interface DataViewerPanelProps {
	tableName?: string | undefined;
}

function DataViewerPanel({ tableName }: DataViewerPanelProps) {
	const { isSysop } = useAuthorization();
	const { getFilter, setFilters } = useUrlFilters();
	const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
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
			{ replace: false }
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
			{ replace: false }
		);
	};

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

	if (!tableName) {
		return (
			<Card>
				<CardContent className="py-8">
					<p className="text-muted-foreground text-center text-sm">
						Select a table from the Schema tab to view its data.
					</p>
				</CardContent>
			</Card>
		);
	}

	const rows = dataResponse?.data ?? [];
	const total = dataResponse?.total ?? 0;
	const totalPages = Math.ceil(total / limit);
	const firstRow = rows[0];
	const columnNames = firstRow ? Object.keys(firstRow) : columns.map((c) => c.name);

	return (
		<div className="space-y-4">
			<DataViewerToolbar
				actions={{
					onCreateClick: () => setCreateDialogOpen(true),
					onIncludeDeletedChange: setIncludeDeleted,
					onSafeModeToggle: (checked) => safeModeToggle.mutate(checked),
				}}
				columnNames={columnNames}
				rows={rows}
				state={{
					hasIsDeleted,
					includeDeleted,
					isSysop: isSysop(),
					safeMode,
					safeModeTogglePending: safeModeToggle.isPending,
				}}
				tableName={tableName}
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
				columnNames={columnNames}
				editingCell={editingCell}
				rows={rows}
				state={{
					canMutate,
					hasIsDeleted,
					isLoading,
				}}
			/>

			<DataViewerPagination
				onPageChange={setPage}
				page={page}
				total={total}
				totalPages={totalPages}
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
