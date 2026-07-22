import { Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useWorkspaceMembers, useWorkspaces } from '@/hooks/useWorkspaces';

import { WorkspaceConfirmDialogs } from './WorkspaceConfirmDialogs';
import { WorkspaceFormDialogs } from './WorkspaceFormDialogs';
import { WorkspaceList } from './WorkspaceList';
import { useWorkspaceDialogState } from './workspaceManagementHelpers';
import { WorkspaceMembersSection } from './WorkspaceMembersSection';

function WorkspaceManagementPage() {
	const { can } = useAuthorization();
	const navigate = useNavigate();
	const {
		addMemberForm,
		closeDialog,
		deleteTarget,
		dialog,
		removeMemberTarget,
		selectedWorkspace,
		setAddMemberForm,
		setDeleteTarget,
		setDialog,
		setRemoveMemberTarget,
	} = useWorkspaceDialogState();

	const {
		createWorkspace,
		createWorkspaceIsPending,
		deleteWorkspace,
		isLoading,
		updateWorkspace,
		updateWorkspaceIsPending,
		workspaces,
	} = useWorkspaces();
	const {
		addMember,
		addMemberIsPending,
		bulkAddMembers,
		bulkAddMembersIsPending,
		bulkRemoveMembers,
		bulkRemoveMembersIsPending,
		members,
		removeMember,
		updateMemberRole,
	} = useWorkspaceMembers(selectedWorkspace);

	return (
		<div className="space-y-6 p-6">
			<PageHeader title="Workspaces">
				{can('ADMIN') && (
					<Button onClick={() => setDialog({ type: 'create' })}>
						<Building2 aria-hidden="true" className="mr-2 h-4 w-4" />
						Create Workspace
					</Button>
				)}
			</PageHeader>

			<WorkspaceList
				isLoading={isLoading}
				onDeleteWorkspace={(id, name) => setDeleteTarget({ id, name })}
				onEditWorkspace={(w) => setDialog({ type: 'edit', workspaceId: w.id })}
				onManageMembers={(id) => setDialog({ type: 'members', workspaceId: id })}
				onWorkspaceSettings={(id) => {
					void navigate(`/workspaces/${id}/settings`);
				}}
				workspaces={workspaces}
			/>

			<WorkspaceFormDialogs
				closeDialog={closeDialog}
				createWorkspace={createWorkspace}
				createWorkspaceIsPending={createWorkspaceIsPending}
				dialog={dialog}
				selectedWorkspace={selectedWorkspace}
				updateWorkspace={updateWorkspace}
				updateWorkspaceIsPending={updateWorkspaceIsPending}
				workspaces={workspaces}
			/>

			<WorkspaceMembersSection
				addMemberForm={addMemberForm}
				closeDialog={closeDialog}
				dialogType={dialog.type}
				memberHooks={{
					addMember,
					addMemberIsPending,
					bulkAddMembers,
					bulkAddMembersIsPending,
					bulkRemoveMembers,
					bulkRemoveMembersIsPending,
					updateMemberRole,
				}}
				members={members}
				selectedWorkspace={selectedWorkspace}
				setAddMemberForm={setAddMemberForm}
				setRemoveMemberTarget={setRemoveMemberTarget}
			/>

			<WorkspaceConfirmDialogs
				deleteTarget={deleteTarget}
				deleteWorkspace={deleteWorkspace}
				onClearDeleteTarget={() => setDeleteTarget(null)}
				onClearRemoveMemberTarget={() => setRemoveMemberTarget(null)}
				removeMember={removeMember}
				removeMemberTarget={removeMemberTarget}
			/>
		</div>
	);
}

export { WorkspaceManagementPage };
