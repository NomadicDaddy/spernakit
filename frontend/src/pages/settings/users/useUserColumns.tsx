import { type ColumnDef } from '@tanstack/react-table';
import { Eye, KeyRound, LockOpen, MoreHorizontal, Trash2, UserPen } from 'lucide-react';

import type { User } from '@/api/types';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { createSelectColumn } from '@/components/shared/data-table/selectColumn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFormatters } from '@/hooks/useFormatters';
import { roleBadgeVariant } from '@/lib/roleBadge';

import { UserStatusBadge } from './UserStatusBadge';

function isUserLocked(user: User): boolean {
	const hasActiveLock = user.lockedUntil && new Date(user.lockedUntil) > new Date();
	const hasFailedAttempts = user.failedLoginAttempts && user.failedLoginAttempts > 0;
	return !!(hasActiveLock || hasFailedAttempts);
}

interface UserColumnsProps {
	/** Prepend the row-selection column. Set this only when the table also passes
	 * onRowSelectionChange, so the checkboxes and the bulk bar appear together. */
	enableSelection?: boolean;
	onDelete: (user: User) => void;
	onEdit: (user: User) => void;
	onImpersonate: (user: User) => void;
	onResetPassword: (user: User) => void;
	onUnlock: (user: User) => void;
}

export function useUserColumns({
	enableSelection = false,
	onDelete,
	onEdit,
	onImpersonate,
	onResetPassword,
	onUnlock,
}: UserColumnsProps) {
	const { isAdmin, isSysop, user: currentUser } = useAuthorization();
	const { roleLabel } = useAuthorization();
	const { formatDate } = useFormatters();

	/*
	 * `username` and `email` deliberately declare no `size`: they are the row's identity, they are
	 * the only columns whose content has no bound, and a fluid column absorbs whatever the sized
	 * ones leave. Every other column here holds a badge or a formatted date — content of a known
	 * width — so it is sized, which is the split `DataTableProps.columns` documents. This table
	 * declared nothing at all, and because `DataTable` used to emit an inline width for every
	 * column regardless, all seven rendered at an identical 198px with a five-character role chip
	 * occupying exactly as much of the row as the email address.
	 */
	const columns: ColumnDef<DataTableFeatures, User, unknown>[] = [
		...(enableSelection ? [createSelectColumn<User>()] : []),
		{
			accessorKey: 'username',
			header: 'Username',
		},
		{
			accessorKey: 'email',
			header: 'Email',
		},
		{
			accessorKey: 'role',
			cell: ({ row }) => {
				const role = row.original.role;
				return <Badge variant={roleBadgeVariant[role]}>{roleLabel(role)}</Badge>;
			},
			header: 'Role',
			size: 110,
		},
		{
			accessorKey: 'status',
			cell: ({ row }) => {
				return (
					<UserStatusBadge
						failedLoginAttempts={row.original.failedLoginAttempts}
						lockedUntil={row.original.lockedUntil}
					/>
				);
			},
			header: 'Status',
			size: 110,
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => (row.original.createdAt ? formatDate(row.original.createdAt) : '—'),
			header: 'Created',
			size: 120,
		},
		{
			accessorKey: 'lastLoginAt',
			cell: ({ row }) =>
				row.original.lastLoginAt ? formatDate(row.original.lastLoginAt) : '—',
			header: 'Last Login',
			size: 120,
		},
		{
			cell: ({ row }) => {
				const user = row.original;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button aria-label="User actions" size="icon" variant="ghost">
								<MoreHorizontal aria-hidden="true" className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onEdit(user)}>
								<UserPen aria-hidden="true" className="size-4" />
								Edit
							</DropdownMenuItem>
							{isSysop() && currentUser?.id !== user.id && (
								<DropdownMenuItem onClick={() => onImpersonate(user)}>
									<Eye aria-hidden="true" className="size-4" />
									Impersonate
								</DropdownMenuItem>
							)}
							{isAdmin() && currentUser?.id !== user.id && (
								<DropdownMenuItem onClick={() => onResetPassword(user)}>
									<KeyRound aria-hidden="true" className="size-4" />
									Reset Password
								</DropdownMenuItem>
							)}
							{isUserLocked(user) && (
								<DropdownMenuItem onClick={() => onUnlock(user)}>
									<LockOpen aria-hidden="true" className="size-4" />
									Unlock Account
								</DropdownMenuItem>
							)}
							<DropdownMenuItem onClick={() => onDelete(user)} variant="destructive">
								<Trash2 aria-hidden="true" className="size-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
			enableHiding: false,
			id: 'actions',
			size: 64,
		},
	];

	return columns;
}
