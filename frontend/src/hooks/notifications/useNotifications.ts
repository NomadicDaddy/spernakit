import {
	type QueryClient,
	type QueryKey,
	useMutation,
	useQuery,
	useQueryClient,
} from '@tanstack/react-query';
import { toast } from 'sonner';

import type { NotificationRetentionPolicy } from '@/api/notifications';
import type { DataResponse, Notification, PaginatedResponse, SuccessResponse } from '@/api/types';

import {
	bulkDeleteNotifications,
	deleteNotification,
	getNotificationRetentionPolicy,
	listNotifications,
	markAllNotificationsAsRead,
	markNotificationAsRead,
	notificationKeys,
} from '@/api/notifications';
import { useWorkspaceStore } from '@/stores/workspaceStore';

export type ReadFilter = 'all' | 'read' | 'unread';

/**
 * Fetch the effective notification retention policy (ADMIN+ endpoint).
 * Pass `enabled: false` for non-admin viewers so the query never fires a 403.
 */
export function useNotificationRetentionPolicy(enabled = true) {
	return useQuery<DataResponse<NotificationRetentionPolicy>>({
		enabled,
		queryFn: getNotificationRetentionPolicy,
		queryKey: ['notification-retention-policy'],
		staleTime: 5 * 60 * 1000,
	});
}

interface MutationContext {
	previousData: PaginatedResponse<Notification> | undefined;
}

interface UseNotificationsOptions {
	limit: number;
	page: number;
	readFilter: ReadFilter;
	typeFilter: string;
}

function buildOptimisticCallbacks<TVariable>(
	queryClient: QueryClient,
	queryKey: QueryKey,
	workspaceId: null | number,
	transform: (
		old: PaginatedResponse<Notification>,
		variable: TVariable
	) => PaginatedResponse<Notification>
) {
	return {
		onError: (_err: Error, _variable: TVariable, context: MutationContext | undefined) => {
			if (context?.previousData) {
				queryClient.setQueryData(queryKey, context.previousData);
			}
		},
		onMutate: async (variable: TVariable): Promise<MutationContext> => {
			await queryClient.cancelQueries({ queryKey });
			const previousData =
				queryClient.getQueryData<PaginatedResponse<Notification>>(queryKey);
			queryClient.setQueryData<PaginatedResponse<Notification>>(queryKey, (old) =>
				old ? transform(old, variable) : old
			);
			return { previousData };
		},
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.statistics(workspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.unreadCount(workspaceId),
			});
			void queryClient.invalidateQueries({ queryKey });
		},
	};
}

export function useNotifications({ limit, page, readFilter, typeFilter }: UseNotificationsOptions) {
	const queryClient = useQueryClient();
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

	const params = {
		limit: String(limit),
		page: String(page),
		...(readFilter !== 'all' ? { readStatus: readFilter } : {}),
		...(typeFilter !== 'all' ? { type: typeFilter } : {}),
	};
	const queryKey = notificationKeys.list(activeWorkspaceId, params);

	const { data, isLoading } = useQuery<PaginatedResponse<Notification>>({
		enabled: activeWorkspaceId !== null,
		queryFn: () => listNotifications(params),
		queryKey,
	});

	const markReadMutation = useMutation<SuccessResponse, Error, number, MutationContext>({
		mutationFn: markNotificationAsRead,
		...buildOptimisticCallbacks<number>(
			queryClient,
			queryKey,
			activeWorkspaceId,
			(old, id) => ({
				...old,
				data: old.data.map((n) =>
					n.id === id ? { ...n, readAt: new Date().toISOString() } : n
				),
			})
		),
		onSuccess: () => {
			toast.success('Notification marked as read');
		},
	});

	const markAllReadMutation = useMutation({
		mutationFn: markAllNotificationsAsRead,
		onSuccess: (response) => {
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.statistics(activeWorkspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.recent(activeWorkspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.unreadCount(activeWorkspaceId),
			});
			void queryClient.invalidateQueries({ queryKey });
			toast.success(`Marked ${response.data.count} notifications as read`);
		},
	});

	const deleteMutation = useMutation<SuccessResponse, Error, number, MutationContext>({
		mutationFn: deleteNotification,
		...buildOptimisticCallbacks<number>(
			queryClient,
			queryKey,
			activeWorkspaceId,
			(old, id) => ({
				...old,
				data: old.data.filter((n) => n.id !== id),
				total: old.total - 1,
			})
		),
		onSuccess: () => {
			toast.success('Notification deleted');
		},
	});

	const bulkDeleteMutation = useMutation<
		DataResponse<{ count: number }>,
		Error,
		number[],
		MutationContext
	>({
		mutationFn: bulkDeleteNotifications,
		...buildOptimisticCallbacks<number[]>(
			queryClient,
			queryKey,
			activeWorkspaceId,
			(old, ids) => {
				const idSet = new Set(ids);
				return {
					...old,
					data: old.data.filter((n) => !idSet.has(n.id)),
					total: old.total - ids.length,
				};
			}
		),
		onSettled: () => {
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.statistics(activeWorkspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.unreadCount(activeWorkspaceId),
			});
			void queryClient.invalidateQueries({
				queryKey: notificationKeys.recent(activeWorkspaceId),
			});
			void queryClient.invalidateQueries({ queryKey });
		},
		onSuccess: (response) => {
			toast.success(`Deleted ${response.data.count} notifications`);
		},
	});

	return {
		bulkDeleteMutation,
		data,
		deleteMutation,
		isLoading,
		markAllReadMutation,
		markReadMutation,
	};
}
