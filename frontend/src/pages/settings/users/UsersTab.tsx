import { Plus, Shield, Trash2, Users } from 'lucide-react';
import { useState } from 'react';

import type { User } from '@/api/types';
import type { CreateUserInput } from '@/api/users';

import { DataTable } from '@/components/shared/data-table/DataTable';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsers } from '@/hooks/settings/useUsers';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useUrlFilters } from '@/hooks/useUrlFilters';

import {
	BulkDeleteDialog,
	BulkRoleDialog,
	CreateUserDialog,
	DeleteUserDialog,
	EditUserDialog,
	ImpersonateDialog,
	ResetPasswordDialog,
	UserTableFilters,
} from './index';
import { useUserColumns } from './useUserColumns';

type DialogState =
	| { newRole: string; type: 'bulkRole' }
	| { type: 'bulkDelete' }
	| { type: 'create' }
	| { type: 'delete'; user: User }
	| { type: 'edit'; user: User }
	| { type: 'impersonate'; user: User }
	| { type: 'resetPassword'; user: User }
	| null;

function UsersTab() {
	const { getFilter, limit, page, setFilter, setFilters, setLimit, setPage } = useUrlFilters(20);
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

	// Selection is held here but rendered by the table, and the table unmounts while a
	// new page loads. Clearing both together keeps the bulk bar from offering actions
	// on rows the user can no longer see or uncheck.
	function clearSelection() {
		setSelectedRows([]);
		setSelectionResetToken((token) => token + 1);
	}

	function handleBulkDelete() {
		const ids = selectedRows.map((u) => u.id);
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
					// One navigation, not two — see the warning on `setFilter`.
					onClearFilters: () => {
						setFilters((params) => {
							params.delete('search');
							params.delete('role');
							params.delete('page');
						});
					},
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
					<Button onClick={() => setDialog({ type: 'create' })} size="sm">
						<Plus aria-hidden="true" className="size-4" />
						Create User
					</Button>
				}
			/>

			{/*
			 * The bulk bar used to be inserted above the table, so ticking a checkbox shoved every
			 * row 64px down and out from under the pointer. Below the table and sticky, it never
			 * moves the rows it acts on. It also carries the card surface rather than `bg-muted`,
			 * which is the exact colour a selected row computes to — bar and selection used to be
			 * one flat grey.
			 */}
			{isAdmin() && selectedRows.length > 0 && (
				<div className="sticky bottom-4 z-20 flex items-center gap-2 rounded-xl border bg-card px-4 py-2 shadow-[var(--shadow-card)]">
					<span className="text-sm text-muted-foreground">
						{selectedRows.length} selected
					</span>
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
				</div>
			)}

			<CreateUserDialog
				isOpen={dialog?.type === 'create'}
				isPending={createMutation.isPending}
				onCreate={(form: CreateUserInput) =>
					createMutation.mutate(form, {
						onSuccess: () => setDialog(null),
					})
				}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
			/>

			<EditUserDialog
				isOpen={dialog?.type === 'edit'}
				isPending={updateMutation.isPending}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
				onUpdate={(id, input) =>
					updateMutation.mutate(
						{ id, input: input },
						{ onSuccess: () => setDialog(null) },
					)
				}
				user={dialog?.type === 'edit' ? dialog.user : null}
			/>

			<DeleteUserDialog
				isOpen={dialog?.type === 'delete'}
				isPending={deleteMutation.isPending}
				onConfirm={(id) => deleteMutation.mutate(id)}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
				user={dialog?.type === 'delete' ? dialog.user : null}
			/>

			<BulkDeleteDialog
				isPending={bulkDeleteMutation.isPending}
				onConfirm={handleBulkDelete}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
				open={dialog?.type === 'bulkDelete'}
				selectedRows={selectedRows}
			/>

			<BulkRoleDialog
				isPending={bulkRoleMutation.isPending}
				newRole={dialog?.type === 'bulkRole' ? dialog.newRole : 'OPERATOR'}
				onConfirm={handleBulkRoleUpdate}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
				onRoleChange={(role) => setDialog({ newRole: role, type: 'bulkRole' })}
				open={dialog?.type === 'bulkRole'}
				selectedRows={selectedRows}
			/>

			<ResetPasswordDialog
				isOpen={dialog?.type === 'resetPassword'}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
				user={dialog?.type === 'resetPassword' ? dialog.user : null}
			/>

			<ImpersonateDialog
				isOpen={dialog?.type === 'impersonate'}
				onOpenChange={(open) => {
					if (!open) setDialog(null);
				}}
				user={dialog?.type === 'impersonate' ? dialog.user : null}
			/>
		</div>
	);
}

export { UsersTab };
