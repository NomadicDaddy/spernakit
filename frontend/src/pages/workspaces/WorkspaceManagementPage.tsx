import { Building2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { WorkspaceMember } from '@/api/types';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useWorkspaceMembers, useWorkspaces } from '@/hooks/useWorkspaces';

import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { EditWorkspaceDialog } from './EditWorkspaceDialog';
import { ManageMembersDialog } from './ManageMembersDialog';
import { ViewMembersDialog } from './ViewMembersDialog';
import { WorkspaceConfirmDialogs, type DialogState } from './WorkspaceConfirmDialogs';
import { WorkspaceList } from './WorkspaceList';

function withWorkspaceId<A extends unknown[]>(
	workspaceId: null | number,
	fn: (id: number, ...args: A) => void
): (...args: A) => void {
	return (...args: A) => {
		if (workspaceId !== null) fn(workspaceId, ...args);
	};
}

function useWorkspaceDialogState() {
	const [dialog, setDialog] = useState<DialogState>({ type: null });
	const [addMemberForm, setAddMemberForm] = useState({ role: 'VIEWER', userId: 0 });
	const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
	const [removeMemberTarget, setRemoveMemberTarget] = useState<{
		userId: number;
		workspaceId: number;
	} | null>(null);

	const selectedWorkspace =
		dialog.type === 'edit' || dialog.type === 'members' ? dialog.workspaceId : null;

	const closeDialog = () => setDialog({ type: null });

	return {
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
	};
}

function WorkspaceMembersSection({
	addMemberForm,
	closeDialog,
	dialogType,
	memberHooks,
	members,
	selectedWorkspace,
	setAddMemberForm,
	setRemoveMemberTarget,
}: {
	addMemberForm: { role: string; userId: number };
	closeDialog: () => void;
	dialogType: DialogState['type'];
	memberHooks: {
		addMember: ReturnType<typeof useWorkspaceMembers>['addMember'];
		addMemberIsPending: boolean;
		bulkAddMembers: ReturnType<typeof useWorkspaceMembers>['bulkAddMembers'];
		bulkAddMembersIsPending: boolean;
		bulkRemoveMembers: ReturnType<typeof useWorkspaceMembers>['bulkRemoveMembers'];
		bulkRemoveMembersIsPending: boolean;
		updateMemberRole: ReturnType<typeof useWorkspaceMembers>['updateMemberRole'];
	};
	members: WorkspaceMember[];
	selectedWorkspace: null | number;
	setAddMemberForm: React.Dispatch<React.SetStateAction<{ role: string; userId: number }>>;
	setRemoveMemberTarget: React.Dispatch<
		React.SetStateAction<{ userId: number; workspaceId: number } | null>
	>;
}) {
	const { can } = useAuthorization();

	if (!can('MANAGER')) {
		return (
			<ViewMembersDialog
				isOpen={dialogType === 'members'}
				members={members}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
			/>
		);
	}

	return (
		<ManageMembersDialog
			bulkIsPending={{
				add: memberHooks.bulkAddMembersIsPending,
				remove: memberHooks.bulkRemoveMembersIsPending,
			}}
			formState={{
				addMemberForm,
				onUpdateAddMemberForm: (update) =>
					setAddMemberForm((prev) => ({ ...prev, ...update })),
			}}
			isOpen={dialogType === 'members'}
			isPending={memberHooks.addMemberIsPending}
			members={members}
			onOpenChange={(open) => {
				if (!open) closeDialog();
			}}
			operations={{
				onAddMember: () => {
					if (!selectedWorkspace || addMemberForm.userId === 0) return;
					memberHooks.addMember({
						role: addMemberForm.role,
						userId: addMemberForm.userId,
						workspaceId: selectedWorkspace,
					});
				},
				onBulkAddMembers: withWorkspaceId(
					selectedWorkspace,
					(id, list: { role: string; userId: number }[]) =>
						memberHooks.bulkAddMembers({ members: list, workspaceId: id })
				),
				onBulkRemoveMembers: withWorkspaceId(selectedWorkspace, (id, userIds: number[]) =>
					memberHooks.bulkRemoveMembers({ userIds, workspaceId: id })
				),
				onRemoveMember: withWorkspaceId(selectedWorkspace, (id, userId: number) => {
					setRemoveMemberTarget({ userId, workspaceId: id });
				}),
				onUpdateMemberRole: withWorkspaceId(
					selectedWorkspace,
					(id, userId: number, role: string) =>
						memberHooks.updateMemberRole({ role, userId, workspaceId: id })
				),
			}}
		/>
	);
}

function WorkspaceFormDialogs({
	closeDialog,
	createWorkspace,
	createWorkspaceIsPending,
	dialog,
	selectedWorkspace,
	updateWorkspace,
	updateWorkspaceIsPending,
	workspaces,
}: {
	closeDialog: () => void;
	createWorkspace: ReturnType<typeof useWorkspaces>['createWorkspace'];
	createWorkspaceIsPending: boolean;
	dialog: DialogState;
	selectedWorkspace: null | number;
	updateWorkspace: ReturnType<typeof useWorkspaces>['updateWorkspace'];
	updateWorkspaceIsPending: boolean;
	workspaces: ReturnType<typeof useWorkspaces>['workspaces'];
}) {
	return (
		<>
			<CreateWorkspaceDialog
				isOpen={dialog.type === 'create'}
				isPending={createWorkspaceIsPending}
				onCreate={(form) => {
					createWorkspace(form, { onSuccess: () => closeDialog() });
				}}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
			/>

			<EditWorkspaceDialog
				isOpen={dialog.type === 'edit'}
				isPending={updateWorkspaceIsPending}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				onUpdate={withWorkspaceId(
					selectedWorkspace,
					(id, form: { description?: string; name?: string }) => {
						updateWorkspace({ id, input: form });
						closeDialog();
					}
				)}
				workspace={workspaces.find((w) => w.id === selectedWorkspace)}
			/>
		</>
	);
}

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
