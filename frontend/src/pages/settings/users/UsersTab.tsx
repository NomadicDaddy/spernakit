import { Plus, Shield, Trash2 } from 'lucide-react';
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
	const { getFilter, limit, page, setFilter, setLimit, setPage } = useUrlFilters(20);
	const search = getFilter('search');
	const roleFilter = getFilter('role');
	const [selectedRows, setSelectedRows] = useState<User[]>([]);
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
		onDelete: (user) => setDialog({ type: 'delete', user }),
		onEdit: (user) => setDialog({ type: 'edit', user }),
		onImpersonate: (user) => setDialog({ type: 'impersonate', user }),
		onResetPassword: (user) => setDialog({ type: 'resetPassword', user }),
		onUnlock: (user) => unlockMutation.mutate(user.id),
	});

	const users = data?.data ?? [];
	const total = data?.total ?? 0;

	function handleBulkDelete() {
		const ids = selectedRows.map((u) => u.id);
		bulkDeleteMutation.mutate(ids, {
			onSuccess: () => {
				setSelectedRows([]);
				setDialog(null);
			},
		});
	}

	function handleBulkRoleUpdate() {
		if (dialog?.type !== 'bulkRole') return;
		const updates = selectedRows.map((u) => ({ id: u.id, role: dialog.newRole }));
		bulkRoleMutation.mutate(updates, {
			onSuccess: () => {
				setSelectedRows([]);
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
			<UserTableFilters
				onRoleFilterChange={(value) => setFilter('role', value)}
				onSearchChange={(value) => setFilter('search', value)}
				roleFilter={roleFilter}
				search={search}
			/>

			{isAdmin() && selectedRows.length > 0 && (
				<div className="bg-muted flex items-center gap-2 rounded-md px-4 py-2">
					<span className="text-muted-foreground text-sm">
						{selectedRows.length} selected
					</span>
					<Button
						onClick={() => setDialog({ type: 'bulkDelete' })}
						size="sm"
						variant="destructive">
						<Trash2 aria-hidden="true" className="mr-2 size-4" />
						Delete Selected
					</Button>
					<Button
						onClick={() => setDialog({ newRole: 'OPERATOR', type: 'bulkRole' })}
						size="sm"
						variant="outline">
						<Shield aria-hidden="true" className="mr-2 size-4" />
						Change Role
					</Button>
				</div>
			)}

			<DataTable
				columns={columns}
				data={users}
				{...(isAdmin() ? { onRowSelectionChange: setSelectedRows } : {})}
				pagination={{
					limit,
					onPageChange: setPage,
					onPageSizeChange: setLimit,
					page,
					total,
				}}
			/>

			<div className="ml-auto">
				<Button onClick={() => setDialog({ type: 'create' })} size="sm">
					<Plus aria-hidden="true" className="mr-2 size-4" />
					Create User
				</Button>
			</div>

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
						{ onSuccess: () => setDialog(null) }
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
