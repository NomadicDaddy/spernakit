import type { WorkspaceMember } from '@/api/types';

import { useAuthorization } from '@/hooks/useAuthorization';
import { type useWorkspaceMembers } from '@/hooks/useWorkspaces';

import { ManageMembersDialog } from './ManageMembersDialog';
import { ViewMembersDialog } from './ViewMembersDialog';
import { type DialogState } from './WorkspaceConfirmDialogs';
import { withWorkspaceId } from './workspaceManagementHelpers';

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

export { WorkspaceMembersSection };
