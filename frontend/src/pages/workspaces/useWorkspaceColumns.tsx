import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, Settings, SquarePen, Trash2, Users } from 'lucide-react';

import type { Workspace } from '@/api/types';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';

interface WorkspaceColumnsProps {
	onDeleteWorkspace: (id: number, name: string) => void;
	onEditWorkspace: (workspace: { description: null | string; id: number; name: string }) => void;
	onManageMembers: (id: number) => void;
	onWorkspaceSettings: (id: number) => void;
}

/**
 * Columns for the workspace list, written the way `useUserColumns` is.
 *
 * The row previously carried its actions inline: two labelled outline buttons and two ghost icon
 * buttons, ~350px of nowrap controls in the last cell. That cost the surface both its consistency
 * with the rest of the admin area — where a row's actions are one `MoreHorizontal` trigger — and,
 * at 1024, 22px of horizontal overflow that clipped the destructive Delete button and truncated
 * the "Actions" header to "Actio". One 32px trigger fixes both at once.
 */
function useWorkspaceColumns({
	onDeleteWorkspace,
	onEditWorkspace,
	onManageMembers,
	onWorkspaceSettings,
}: WorkspaceColumnsProps): ColumnDef<DataTableFeatures, Workspace, unknown>[] {
	const { user } = useAuth();
	const { can } = useAuthorization();

	return [
		{
			accessorKey: 'name',
			cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
			header: 'Name',
			size: 180,
		},
		{
			accessorKey: 'description',
			/*
			 * Fluid, and allowed to wrap. At 2250 the four short values were strung across 1470px
			 * with a 431px void between the last of them and the first action button; with the
			 * actions column pinned to its trigger, the description is the column that absorbs the
			 * slack, so it is the one that must be able to use it.
			 */
			cell: ({ row }) => (
				<span className="whitespace-normal text-muted-foreground">
					{row.original.description ?? '—'}
				</span>
			),
			header: 'Description',
		},
		{
			accessorFn: (row) => (row.ownerId === user?.id ? 'You' : (row.ownerUsername ?? '—')),
			header: 'Owner',
			id: 'owner',
			size: 140,
		},
		{
			accessorKey: 'isDefault',
			/*
			 * A badge on the default workspace and nothing on the others, rather than "Yes"/"No" as
			 * body prose. This was the only state in the admin area not rendered as a Badge, and
			 * printing "No" on every other row made the eye read a column that carries one bit.
			 */
			cell: ({ row }) =>
				row.original.isDefault ? <Badge variant="secondary">Default</Badge> : null,
			header: 'Default',
			size: 100,
		},
		{
			cell: ({ row }) => {
				const workspace = row.original;
				const isOwner = workspace.ownerId === user?.id;
				return (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<Button
								aria-label={`Actions for workspace ${workspace.name}`}
								size="icon"
								variant="ghost">
								<MoreHorizontal aria-hidden="true" className="size-4" />
							</Button>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="end">
							<DropdownMenuItem onClick={() => onManageMembers(workspace.id)}>
								<Users aria-hidden="true" className="size-4" />
								Members
							</DropdownMenuItem>
							{can('MANAGER') && (
								<DropdownMenuItem onClick={() => onWorkspaceSettings(workspace.id)}>
									<Settings aria-hidden="true" className="size-4" />
									Settings
								</DropdownMenuItem>
							)}
							{isOwner && can('ADMIN') && (
								<>
									<DropdownMenuItem onClick={() => onEditWorkspace(workspace)}>
										<SquarePen aria-hidden="true" className="size-4" />
										Edit
									</DropdownMenuItem>
									<DropdownMenuItem
										className="text-destructive"
										onClick={() =>
											onDeleteWorkspace(workspace.id, workspace.name)
										}>
										<Trash2 aria-hidden="true" className="size-4" />
										Delete
									</DropdownMenuItem>
								</>
							)}
						</DropdownMenuContent>
					</DropdownMenu>
				);
			},
			enableHiding: false,
			enableSorting: false,
			header: 'Actions',
			id: 'actions',
			size: 64,
		},
	];
}

export { useWorkspaceColumns };
