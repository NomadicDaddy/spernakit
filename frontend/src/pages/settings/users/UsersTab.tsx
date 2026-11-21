import { Plus, Shield, Trash2, Users } from 'lucide-react';
import { useState } from 'react';

import type { User } from '@/api/types';

import { BulkActionBar } from '@/components/shared/data-table/BulkActionBar';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsers } from '@/hooks/settings/useUsers';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useUrlFilters } from '@/hooks/useUrlFilters';

import { UserTableFilters } from './index';
import { type DialogState, UsersTabDialogs } from './UsersTabDialogs';
import { useUserColumns } from './useUserColumns';

function UsersTab() {
	const { getFilter, limit, page, setFilter, setFilters, setLimit, setPage } = useUrlFilters();
	const search = getFilter('search');
	const roleFilter = getFilter('role');
	const [selectedRows, setSelectedRows] = useState<User[]>([]);
	const [selectionResetToken, setSelectionResetToken] = useState(0);
	const [dialog, setDialog] = useState<DialogState>(null);

	const { isAdmin } = useAuthorization();

	const {
		bulkDeleteMutation,
		bulkRoleMutation,
		createMutation,
		data,
		deleteMutation,
		isLoading,
		unlockMutation,
		updateMutation,
	} = useUsers(page, limit, search, roleFilter);

	const columns = useUserColumns({
		enableSelection: isAdmin(),
		onDelete: (user) => setDialog({ type: 'delete', user }),
		onEdit: (user) => setDialog({ type: 'edit', user }),
		onImpersonate: (user) => setDialog({ type: 'impersonate', user }),
		onResetPassword: (user) => setDialog({ type: 'resetPassword', user }),
		onUnlock: (user) => unlockMutation.mutate(user.id),
	});

	const users = data?.data ?? [];
	const total = data?.total ?? 0;

	/*
	 * How many selected rows the current filter is hiding.
	 *
	 * Both filters are server-side, so `users` is exactly what is on screen and a selected row
	 * missing from it is a row the operator cannot see or untick. Changing page clears the
	 * selection outright (see `clearSelection`), so anything counted here was hidden by a filter
	 * rather than by pagination — which is what makes offering "Clear filters" the right escape.
	 */
	const visibleIds = new Set(users.map((u) => u.id));
	const hiddenSelectedCount = selectedRows.filter((u) => !visibleIds.has(u.id)).length;

	// One navigation, not two — see the warning on `setFilter`.
	function clearFilters() {
		setFilters((params) => {
			params.delete('search');
			params.delete('role');
			params.delete('page');
		});
	}

	// Selection is held here but rendered by the table, and the table unmounts while a
	// new page loads. Clearing both together keeps the bulk bar from offering actions
	// on rows the user can no longer see or uncheck.
	function clearSelection() {
		setSelectedRows([]);
		setSelectionResetToken((token) => token + 1);
	}

	function handleBulkDelete() {
		const ids = selectedRows.map((u) => u.id);
		// destructive-confirmation-allow: confirmed by BulkDeleteDialog, whose onConfirm is this
		// handler (UsersTabDialogs.tsx, BulkDialogs). The dialog moved to that file below the line
		// cap, and this gate's handler-to-dialog hop only searches one file.
		bulkDeleteMutation.mutate(ids, {
			onSuccess: () => {
				clearSelection();
				setDialog(null);
			},
		});
	}

	function handleBulkRoleUpdate() {
		if (dialog?.type !== 'bulkRole') return;
		const updates = selectedRows.map((u) => ({ id: u.id, role: dialog.newRole }));
		bulkRoleMutation.mutate(updates, {
			onSuccess: () => {
				clearSelection();
				setDialog(null);
			},
		});
	}

	if (isLoading) {
		return (
			<div className="space-y-4">
				<Skeleton className="h-10 w-full" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	return (
		<div className="space-y-4">
			<DataTable
				columns={columns}
				data={users}
				empty={{
					action: (
						<Button onClick={() => setDialog({ type: 'create' })} size="sm">
							<Plus aria-hidden="true" className="size-4" />
							Create User
						</Button>
					),
					description: 'Create the first account to start assigning roles.',
					icon: Users,
					// Both filters are server-side, so the table's own filter state stays empty and
					// it would otherwise report "no users" while the search box held a string.
					isFiltered: search !== '' || roleFilter !== '',
					onClearFilters: clearFilters,
					title: 'No users yet',
				}}
				{...(isAdmin() ? { onRowSelectionChange: setSelectedRows } : {})}
				pagination={{
					limit,
					onPageChange: (nextPage) => {
						setPage(nextPage);
						clearSelection();
					},
					onPageSizeChange: setLimit,
					page,
					total,
				}}
				selectionResetToken={selectionResetToken}
				toolbar={
					<UserTableFilters
						onRoleFilterChange={(value) => setFilter('role', value)}
						onSearchChange={(value) => setFilter('search', value)}
						roleFilter={roleFilter}
						search={search}
					/>
				}
				toolbarActions={
					/*
					 * Default size, not `sm`. This button shares one flex row with the search Input,
					 * the role Select and the Columns trigger, all 36px; at `sm` it was 32px and read
					 * as a shorter pill at the end of an otherwise even row. DataTableToolbar was
					 * changed to default size for exactly this reason and its comment claims
					 * "anything passed into `actions`" is already 36px — this call site was the one
					 * that made that claim false. /settings/backup passes a default-size button.
					 */
					<Button onClick={() => setDialog({ type: 'create' })}>
						<Plus aria-hidden="true" className="size-4" />
						Create User
					</Button>
				}
			/>

			{/*
			 * The bar's own layout and the hidden-selection disclosure live in BulkActionBar; only
			 * the actions and the counts are this page's business. `hiddenSelectedCount` is what
			 * stops the bar claiming a bare "1 selected" over a table reading "No matching rows".
			 */}
			{isAdmin() && (
				<BulkActionBar
					hiddenCount={hiddenSelectedCount}
					/*
					 * Only while rows are on screen. With none, the table has already rendered its
					 * own empty state — "No matching rows", and a Clear filters button of its own —
					 * and a second identical button in the bar 120px below it says nothing the first
					 * did not. The empty state owns the affordance when it is showing; the bar owns
					 * it the rest of the time, which is exactly when the empty state is absent. Every
					 * hidden-selection case still has one way out, never two and never none.
					 */
					{...(users.length > 0 ? { onClearFilters: clearFilters } : {})}
					selectedCount={selectedRows.length}>
					<Button
						onClick={() => setDialog({ type: 'bulkDelete' })}
						size="sm"
						variant="destructive">
						<Trash2 aria-hidden="true" className="size-4" />
						Delete Selected
					</Button>
					<Button
						onClick={() => setDialog({ newRole: 'OPERATOR', type: 'bulkRole' })}
						size="sm"
						variant="outline">
						<Shield aria-hidden="true" className="size-4" />
						Change Role
					</Button>
				</BulkActionBar>
			)}

			<UsersTabDialogs
				bulkDeleteMutation={bulkDeleteMutation}
				bulkRoleMutation={bulkRoleMutation}
				createMutation={createMutation}
				deleteMutation={deleteMutation}
				dialog={dialog}
				handleBulkDelete={handleBulkDelete}
				handleBulkRoleUpdate={handleBulkRoleUpdate}
				selectedRows={selectedRows}
				setDialog={setDialog}
				updateMutation={updateMutation}
			/>
		</div>
	);
}

export { UsersTab };
