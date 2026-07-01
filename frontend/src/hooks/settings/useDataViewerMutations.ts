import { useMutation, useQueryClient } from '@tanstack/react-query';

import { deleteTableRow, insertRow, setSafeMode, updateRow } from '@/api/databaseAdmin';
import { stdCallbacks } from '@/lib/mutationHelpers';

interface UseDataViewerMutationsOptions {
	onDeleteSuccess: () => void;
	onInsertSuccess: () => void;
	onUpdateSuccess: () => void;
	tableName: string | undefined;
}

function useDataViewerMutations({
	onDeleteSuccess,
	onInsertSuccess,
	onUpdateSuccess,
	tableName,
}: UseDataViewerMutationsOptions) {
	const queryClient = useQueryClient();

	const safeModeToggle = useMutation({
		mutationFn: (enabled: boolean) => setSafeMode(enabled),
		...stdCallbacks(queryClient, {
			errorMessage: 'Failed to update safe mode',
			invalidateKeys: [['database-admin', 'safe-mode']],
			successMessage: 'Safe mode updated',
		}),
	});

	const dataCb = (success: string, error: string, onDone: () => void) =>
		stdCallbacks(queryClient, {
			errorMessage: error,
			invalidateKeys: [
				['database-admin', 'data', tableName],
				['database-admin', 'schema'],
			],
			onSuccess: onDone,
			successMessage: success,
		});

	const updateMutation = useMutation({
		mutationFn: ({ column, rowId, value }: { column: string; rowId: number; value: unknown }) =>
			updateRow(tableName!, rowId, { [column]: value }),
		...dataCb('Row updated', 'Failed to update row', onUpdateSuccess),
	});

	const deleteMutation = useMutation({
		mutationFn: (rowId: number) => deleteTableRow(tableName!, rowId),
		...dataCb('Row deleted', 'Failed to delete row', onDeleteSuccess),
	});

	const insertMutation = useMutation({
		mutationFn: (values: Record<string, unknown>) => insertRow(tableName!, values),
		...dataCb('Row inserted', 'Failed to insert row', onInsertSuccess),
	});

	return { deleteMutation, insertMutation, safeModeToggle, updateMutation };
}

export { useDataViewerMutations };
