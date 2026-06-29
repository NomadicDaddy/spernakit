import type { DataResponse, PaginatedResponse, SuccessResponse, User } from './types';

import { apiClient } from './client';
import { buildQueryParams } from './requestHelpers';

interface CreateUserInput {
	email: string;
	password: string;
	role?: string;
	username: string;
}

interface UpdateUserInput {
	email?: string;
	role?: string;
	username?: string;
}

/**
 * List users with pagination and optional filters.
 *
 * @returns Paginated user list
 */
function listUsers(params?: {
	limit?: string;
	page?: string;
	role?: string;
	search?: string;
}): Promise<PaginatedResponse<User>> {
	const filtered = buildQueryParams(params);
	return apiClient.get<PaginatedResponse<User>>('/users', {
		...(filtered ? { params: filtered } : {}),
	});
}

/**
 * Create a new user.
 *
 * @returns Created user
 */
function createUser(input: CreateUserInput): Promise<DataResponse<User>> {
	return apiClient.post<DataResponse<User>>('/users', { body: input });
}

/**
 * Update a user.
 *
 * @returns Updated user
 */
function updateUser(id: number, input: UpdateUserInput): Promise<DataResponse<User>> {
	return apiClient.put<DataResponse<User>>(`/users/${id}`, { body: input });
}

/**
 * Soft delete a user.
 *
 * @returns Success response
 */
function deleteUser(id: number): Promise<SuccessResponse> {
	return apiClient.delete<SuccessResponse>(`/users/${id}`);
}

/** Result of a single item in a bulk user operation. */
interface UserBatchItemResult {
	error?: string;
	id: number;
	success: boolean;
}

/** Result of a bulk user operation with per-item status. */
interface UserBatchResult {
	failed: number;
	results: UserBatchItemResult[];
	succeeded: number;
	total: number;
}

/**
 * Unlock a locked user account (ADMIN+).
 *
 * @returns Success response
 */
function unlockUser(id: number): Promise<SuccessResponse> {
	return apiClient.post<SuccessResponse>(`/users/${id}/unlock`);
}

/** Bulk soft-delete multiple users (ADMIN+). */
function bulkDeleteUsers(ids: number[]): Promise<DataResponse<UserBatchResult>> {
	return apiClient.post<DataResponse<UserBatchResult>>('/users/bulk-delete', {
		body: { ids },
	});
}

/** Bulk update user roles (ADMIN+). */
function bulkUpdateUserRoles(
	updates: { id: number; role: string }[]
): Promise<DataResponse<UserBatchResult>> {
	return apiClient.put<DataResponse<UserBatchResult>>('/users/bulk/roles', {
		body: { updates },
	});
}

/**
 * Admin-initiated password reset for a user (ADMIN+).
 * Supports 'set' mode (directly set new password) or 'email' mode (send reset token).
 *
 * @returns Success response
 */
function adminResetPassword(
	id: number,
	payload: { mode: 'email' } | { mode: 'set'; password: string }
): Promise<SuccessResponse> {
	return apiClient.post<SuccessResponse>(`/users/${id}/reset-password`, { body: payload });
}

/**
 * Start impersonating a user (SYSOP only).
 *
 * @returns Success response
 */
function impersonateUser(id: number): Promise<SuccessResponse> {
	return apiClient.post<SuccessResponse>(`/users/${id}/impersonate`);
}

/**
 * Stop impersonating and restore original session.
 *
 * @returns Success response
 */
function stopImpersonating(): Promise<SuccessResponse> {
	return apiClient.post<SuccessResponse>('/users/impersonate/stop');
}

export {
	adminResetPassword,
	bulkDeleteUsers,
	bulkUpdateUserRoles,
	createUser,
	deleteUser,
	impersonateUser,
	listUsers,
	stopImpersonating,
	unlockUser,
	updateUser,
};
export type { CreateUserInput, UpdateUserInput, UserBatchResult };
