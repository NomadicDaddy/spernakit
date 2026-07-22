import type {
	BulkOperationResult,
	DataResponse,
	PaginatedResponse,
	SuccessResponse,
	Workspace,
	WorkspaceMember,
	WorkspaceSettings,
} from './types';

import { apiClient } from './client';

function listWorkspaces(): Promise<PaginatedResponse<Workspace>> {
	return apiClient.get<PaginatedResponse<Workspace>>('/workspaces');
}

function createWorkspace(input: {
	description?: string;
	name: string;
	slug: string;
}): Promise<DataResponse<Workspace>> {
	return apiClient.post<DataResponse<Workspace>>('/workspaces', { body: input });
}

function updateWorkspace(
	id: number,
	input: { description?: string; name?: string; settings?: WorkspaceSettings }
): Promise<DataResponse<Workspace>> {
	return apiClient.put<DataResponse<Workspace>>(`/workspaces/${id}`, { body: input });
}

function deleteWorkspace(id: number): Promise<SuccessResponse> {
	return apiClient.delete<SuccessResponse>(`/workspaces/${id}`);
}

function getWorkspaceMembers(id: number): Promise<DataResponse<WorkspaceMember[]>> {
	return apiClient.get<DataResponse<WorkspaceMember[]>>(`/workspaces/${id}/members`);
}

function addWorkspaceMember(
	id: number,
	input: { role: string; userId: number }
): Promise<SuccessResponse> {
	return apiClient.post<SuccessResponse>(`/workspaces/${id}/members`, { body: input });
}

function removeWorkspaceMember(workspaceId: number, userId: number): Promise<SuccessResponse> {
	return apiClient.delete<SuccessResponse>(`/workspaces/${workspaceId}/members/${userId}`);
}

function updateMemberRole(
	workspaceId: number,
	userId: number,
	role: string
): Promise<SuccessResponse> {
	return apiClient.put<SuccessResponse>(`/workspaces/${workspaceId}/members/${userId}/role`, {
		body: { role },
	});
}

function bulkAddMembers(
	workspaceId: number,
	members: { role: string; userId: number }[]
): Promise<DataResponse<BulkOperationResult>> {
	return apiClient.post<DataResponse<BulkOperationResult>>(
		`/workspaces/${workspaceId}/members/bulk`,
		{ body: { members } }
	);
}

function bulkRemoveMembers(
	workspaceId: number,
	userIds: number[]
): Promise<DataResponse<BulkOperationResult>> {
	return apiClient.post<DataResponse<BulkOperationResult>>(
		`/workspaces/${workspaceId}/members/bulk-delete`,
		{ body: { userIds } }
	);
}

export {
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
};
