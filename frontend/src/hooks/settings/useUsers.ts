import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { PaginatedResponse, User } from '@/api/types';
import type { CreateUserInput, UpdateUserInput } from '@/api/users';

import {
	bulkDeleteUsers,
	bulkUpdateUserRoles,
	createUser,
	deleteUser,
	listUsers,
	unlockUser,
	updateUser,
} from '@/api/users';
import { bulkCallbacks, stdCallbacks } from '@/lib/mutationHelpers';

export function useUsers(page: number, limit: number, search: string, roleFilter: string) {
	const queryClient = useQueryClient();

	const queryParams: Record<string, string> = { limit: String(limit), page: String(page) };
	if (search) queryParams.search = search;
	if (roleFilter) queryParams.role = roleFilter;

	const { data, isLoading } = useQuery<PaginatedResponse<User>>({
		queryFn: () => listUsers(queryParams),
		queryKey: ['users', page, limit, search, roleFilter],
	});

	const cb = (success: string, error: string) =>
		stdCallbacks(queryClient, {
			errorMessage: error,
			invalidateKeys: [['users']],
			successMessage: success,
		});

	const createMutation = useMutation({
		mutationFn: (input: CreateUserInput) => createUser(input),
		...cb('User created', 'Failed to create user. Check the input fields and try again.'),
	});

	const updateMutation = useMutation({
		mutationFn: ({ id, input }: { id: number; input: UpdateUserInput }) =>
			updateUser(id, input),
		...cb('User updated', 'Failed to update user. Review the changes and try again.'),
	});

	const deleteMutation = useMutation({
		mutationFn: (id: number) => deleteUser(id),
		...cb('User deleted', 'Failed to delete user. Refresh the list and try again.'),
	});

	const unlockMutation = useMutation({
		mutationFn: (id: number) => unlockUser(id),
		...cb('Account unlocked', 'Failed to unlock account. Refresh the page and try again.'),
	});

	const bulkDeleteMutation = useMutation({
		mutationFn: (ids: number[]) => bulkDeleteUsers(ids),
		...bulkCallbacks(queryClient, {
			action: 'Deleted',
			errorMessage: 'Failed to delete users',
			invalidateKeys: [['users']],
			itemLabel: 'users',
		}),
	});

	const bulkRoleMutation = useMutation({
		mutationFn: (updates: { id: number; role: string }[]) => bulkUpdateUserRoles(updates),
		...bulkCallbacks(queryClient, {
			action: 'Updated',
			errorMessage: 'Failed to update roles',
			invalidateKeys: [['users']],
			itemLabel: 'user roles',
		}),
	});

	return {
		bulkDeleteMutation,
		bulkRoleMutation,
		createMutation,
		data,
		deleteMutation,
		isLoading,
		unlockMutation,
		updateMutation,
	};
}
