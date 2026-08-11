import { Building2 } from 'lucide-react';

import type { Workspace } from '@/api/types';

import { DataTable } from '@/components/shared/data-table/DataTable';
import { EmptyState } from '@/components/shared/EmptyState';
import { useAuthorization } from '@/hooks/useAuthorization';

import { useWorkspaceColumns } from './useWorkspaceColumns';

interface WorkspaceListProps {
	isLoading: boolean;
	onDeleteWorkspace: (id: number, name: string) => void;
	onEditWorkspace: (workspace: { description: null | string; id: number; name: string }) => void;
	onManageMembers: (id: number) => void;
	onWorkspaceSettings: (id: number) => void;
	workspaces: Workspace[];
}

/**
 * The workspace list, rendered through the shared `DataTable` rather than a bare `<Table>` in a
 * `rounded-lg border` div.
 *
 * The hand-rolled shell had no search, no column controls, no sortable headers and no pagination
 * footer, and it sat flat on the page background at a third corner radius — 10px, where the shared
 * table shell is 12px and Card is 14px. Going through `DataTable` inherits all of it, including the
 * `bg-card` raised surface, and leaves this file responsible only for the states the table has no
 * opinion about.
 */
export function WorkspaceList({
	isLoading,
	onDeleteWorkspace,
	onEditWorkspace,
	onManageMembers,
	onWorkspaceSettings,
	workspaces,
}: WorkspaceListProps) {
	const { can } = useAuthorization();
	const columns = useWorkspaceColumns({
		onDeleteWorkspace,
		onEditWorkspace,
		onManageMembers,
		onWorkspaceSettings,
	});

	if (isLoading) {
		return (
			<div className="flex justify-center py-8">
				<div className="text-sm text-muted-foreground">Loading workspaces…</div>
			</div>
		);
	}

	if (workspaces.length === 0) {
		return (
			<EmptyState
				description={
					can('ADMIN')
						? 'Create a workspace to get started.'
						: 'You are not a member of any workspace.'
				}
				icon={Building2}
				title="No workspaces found"
			/>
		);
	}

	return (
		<DataTable
			columns={columns}
			data={workspaces}
			filterPlaceholder="Search workspaces…"
			searchColumn="name"
		/>
	);
}
