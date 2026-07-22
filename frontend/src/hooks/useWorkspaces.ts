import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
	addWorkspaceMember,
	bulkAddMembers,
	bulkRemoveMembers,
	createWorkspace,
	deleteWorkspace,
	getWorkspaceMembers,
	listWorkspaces,
	removeWorkspaceMember,
	updateMemberRole,
	updateWorkspace,
} from '@/api/workspaces';
import { bulkCallbacks, stdCallbacks } from '@/lib/mutationHelpers';

interface CreateWorkspaceForm {
	description: string;
	name: string;
	slug: string;
}

interface EditWorkspaceForm {
	description?: string;
	name?: string;
}

export function useWorkspaces() {
	const queryClient = useQueryClient();
	const {
		data: workspacesData,
		isLoading,
		refetch,
	} = useQuery({
		enabled: true,
		queryFn: listWorkspaces,
		queryKey: ['workspaces'],
	});

	const wsCb = (success: string, error: string) =>
		stdCallbacks(queryClient, {
			errorMessage: error,
			invalidateKeys: [['workspaces']],
			successMessage: success,
		});

	const createMutation = useMutation({
		mutationFn: (input: CreateWorkspaceForm) => createWorkspace(input),
		...wsCb(
			'Workspace created successfully',
			'Failed to create workspace. Check required fields and try again.'
		),
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, input }: { id: number; input: EditWorkspaceForm }) =>
			updateWorkspace(id, input),
		...wsCb(
			'Workspace updated successfully',
			'Failed to update workspace. Review your changes and try again.'
		),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => deleteWorkspace(id),
		...wsCb(
			'Workspace deleted successfully',
			'Failed to delete workspace. Refresh the list and try again.'
		),
	});

	return {
		createWorkspace: createMutation.mutate,
		createWorkspaceIsPending: createMutation.isPending,
		deleteWorkspace: deleteMutation.mutate,
		deleteWorkspaceIsPending: deleteMutation.isPending,
		isLoading,
		refetch,
		updateWorkspace: updateMutation.mutate,
		updateWorkspaceIsPending: updateMutation.isPending,
		workspaces: workspacesData?.data ?? [],
	};
}

export function useWorkspaceMembers(workspaceId: null | number) {
	const queryClient = useQueryClient();

	const { data: membersData } = useQuery({
		enabled: !!workspaceId,
		queryFn: () => getWorkspaceMembers(workspaceId!),
		queryKey: ['workspace-members', workspaceId],
	});

	const memberCb = (success: string, error: string) =>
		stdCallbacks(queryClient, {
			errorMessage: error,
			invalidateKeys: [['workspace-members', workspaceId]],
			successMessage: success,
		});

	const addMemberMutation = useMutation({
		mutationFn: (input: { role: string; userId: number; workspaceId: number }) =>
			addWorkspaceMember(input.workspaceId, { role: input.role, userId: input.userId }),
		...memberCb('Member added successfully', 'Failed to add member'),
	});

	const removeMemberMutation = useMutation({
		mutationFn: ({ userId, workspaceId: wsId }: { userId: number; workspaceId: number }) =>
			removeWorkspaceMember(wsId, userId),
		...memberCb('Member removed successfully', 'Failed to remove member'),
	});

	const updateRoleMutation = useMutation({
		mutationFn: ({
			role,
			userId,
			workspaceId: wsId,
		}: {
			role: string;
			userId: number;
			workspaceId: number;
		}) => updateMemberRole(wsId, userId, role),
		...memberCb('Member role updated successfully', 'Failed to update member role'),
	});

	const bulkCb = (action: string, errorMessage: string) =>
		bulkCallbacks(queryClient, {
			action,
			errorMessage,
			invalidateKeys: [['workspace-members', workspaceId]],
			itemLabel: 'members',
		});

	const bulkAddMembersMutation = useMutation({
		mutationFn: ({
			members,
			workspaceId: wsId,
		}: {
			members: { role: string; userId: number }[];
			workspaceId: number;
		}) => bulkAddMembers(wsId, members),
		...bulkCb('Added', 'Failed to bulk add members'),
	});

	const bulkRemoveMembersMutation = useMutation({
		mutationFn: ({ userIds, workspaceId: wsId }: { userIds: number[]; workspaceId: number }) =>
			bulkRemoveMembers(wsId, userIds),
		...bulkCb('Removed', 'Failed to bulk remove members'),
	});

	return {
		addMember: addMemberMutation.mutate,
		addMemberIsPending: addMemberMutation.isPending,
		bulkAddMembers: bulkAddMembersMutation.mutate,
		bulkAddMembersIsPending: bulkAddMembersMutation.isPending,
		bulkRemoveMembers: bulkRemoveMembersMutation.mutate,
		bulkRemoveMembersIsPending: bulkRemoveMembersMutation.isPending,
		members: membersData?.data ?? [],
		removeMember: removeMemberMutation.mutate,
		removeMemberIsPending: removeMemberMutation.isPending,
		updateMemberRole: updateRoleMutation.mutate,
		updateMemberRoleIsPending: updateRoleMutation.isPending,
	};
}
