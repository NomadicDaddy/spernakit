import { type ColumnDef } from '@tanstack/react-table';
import { Eye, KeyRound, LockOpen, MoreHorizontal, Trash2, UserPen } from 'lucide-react';

import type { User, UserRole } from '@/api/types';
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

import { UserStatusBadge } from './UserStatusBadge';

/**
 * Role is identity, not state, so it stays in the neutral half of the badge vocabulary. SYSOP was
 * `destructive` and ADMIN was `default`, which put the app's red and its primary blue on a column
 * where nothing is wrong and nothing is clickable — and left the actual account state (locked,
 * failed attempts) as the quietest thing in the row.
 *
 * The filled/bordered split marks privileged from unprivileged. The exact tier is carried by the
 * label, which is the only thing that can carry five values without inventing five colours.
 */
const roleBadgeVariant: Record<UserRole, 'outline' | 'secondary'> = {
	ADMIN: 'secondary',
	MANAGER: 'outline',
	OPERATOR: 'outline',
	SYSOP: 'secondary',
	VIEWER: 'outline',
};

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
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => (row.original.createdAt ? formatDate(row.original.createdAt) : '—'),
			header: 'Created',
		},
		{
			accessorKey: 'lastLoginAt',
			cell: ({ row }) =>
				row.original.lastLoginAt ? formatDate(row.original.lastLoginAt) : '—',
			header: 'Last Login',
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
							<DropdownMenuItem
								className="text-destructive"
								onClick={() => onDelete(user)}>
								<Trash2 aria-hidden="true" className="size-4" />
								Delete
							</DropdownMenuItem>
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
			enableHiding: false,
			id: 'actions',
		},
	];

	return columns;
}
