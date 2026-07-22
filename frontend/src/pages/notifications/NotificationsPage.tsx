import { useQuery } from '@tanstack/react-query';
import { CheckCheck, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { DataResponse, Notification, NotificationStatistics } from '@/api/types';

import { trackEvent } from '@/api/businessMetrics';
import { getNotificationStatistics, notificationKeys } from '@/api/notifications';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { PageHeader } from '@/components/shared/PageHeader';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import { useNotificationColumns } from '@/hooks/notifications/useNotificationColumns';
import { useNotifications, type ReadFilter } from '@/hooks/notifications/useNotifications';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { useWorkspaceStore } from '@/stores/workspaceStore';

import { NotificationFilters } from './NotificationFilters';
import { NotificationStatsGrid } from './NotificationStatsGrid';

const VALID_READ_FILTERS = new Set<string>(['all', 'read', 'unread']);

function NotificationPageHeader({
	markAllReadIsPending,
	onMarkAllRead,
	onShowBulkDelete,
	selectedCount,
	totalLabel,
}: {
	markAllReadIsPending: boolean;
	onMarkAllRead: () => void;
	onShowBulkDelete: () => void;
	selectedCount: number;
	totalLabel: string;
}) {
	return (
		<PageHeader description={totalLabel} title="Notifications">
			<Button
				disabled={markAllReadIsPending}
				onClick={onMarkAllRead}
				size="sm"
				variant="outline">
				<CheckCheck aria-hidden="true" className="mr-2 size-4" />
				Mark all read
			</Button>
			{selectedCount > 0 && (
				<Button onClick={onShowBulkDelete} size="sm" variant="destructive">
					<Trash2 aria-hidden="true" className="mr-2 size-4" />
					Delete ({selectedCount})
				</Button>
			)}
		</PageHeader>
	);
}

function NotificationDeleteDialogs({
	bulkDeleteMutation,
	deleteMutation,
	deleteTarget,
	onClearDeleteTarget,
	onClearSelectedRows,
	onShowBulkDeleteChange,
	selectedRows,
	showBulkDelete,
}: {
	bulkDeleteMutation: ReturnType<typeof useNotifications>['bulkDeleteMutation'];
	deleteMutation: ReturnType<typeof useNotifications>['deleteMutation'];
	deleteTarget: Notification | null;
	onClearDeleteTarget: () => void;
	onClearSelectedRows: () => void;
	onShowBulkDeleteChange: (open: boolean) => void;
	selectedRows: Notification[];
	showBulkDelete: boolean;
}) {
	return (
		<>
			<ConfirmAlertDialog
				confirmText="Delete"
				description={`Are you sure you want to delete "${deleteTarget?.title}"? This action cannot be undone.`}
				isOpen={!!deleteTarget}
				isPending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
				}}
				onOpenChange={(open) => {
					if (!open) onClearDeleteTarget();
				}}
				title="Delete notification"
			/>

			<ConfirmAlertDialog
				confirmText="Delete all"
				description={`Are you sure you want to delete ${selectedRows.length} selected notifications? This action cannot be undone.`}
				isOpen={showBulkDelete}
				isPending={bulkDeleteMutation.isPending}
				onConfirm={() => {
					bulkDeleteMutation.mutate(
						selectedRows.map((n) => n.id),
						{
							onSuccess: () => {
								onClearSelectedRows();
								onShowBulkDeleteChange(false);
							},
						}
					);
				}}
				onOpenChange={onShowBulkDeleteChange}
				title={`Delete ${selectedRows.length} notifications`}
			/>
		</>
	);
}

function NotificationsPage() {
	const { getFilter, limit, page, setFilter, setLimit, setPage } = useUrlFilters(20);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

	const readParam = getFilter('read', 'all');
	const readFilter: ReadFilter = VALID_READ_FILTERS.has(readParam)
		? (readParam as ReadFilter)
		: 'all';
	const typeFilter = getFilter('type', 'all');

	const setReadFilter = (filter: ReadFilter) => setFilter('read', filter === 'all' ? '' : filter);
	const setTypeFilter = (filter: string) => setFilter('type', filter === 'all' ? '' : filter);

	const [selectedRows, setSelectedRows] = useState<Notification[]>([]);
	const [deleteTarget, setDeleteTarget] = useState<Notification | null>(null);
	const [showBulkDelete, setShowBulkDelete] = useState(false);

	const {
		bulkDeleteMutation,
		data,
		deleteMutation,
		isLoading,
		markAllReadMutation,
		markReadMutation,
	} = useNotifications({ limit, page, readFilter, typeFilter });

	const { data: statsResponse } = useQuery<DataResponse<NotificationStatistics>>({
		enabled: activeWorkspaceId !== null,
		queryFn: getNotificationStatistics,
		queryKey: notificationKeys.statistics(activeWorkspaceId),
		staleTime: STALE_TIME_SHORT,
	});

	const columns = useNotificationColumns({
		onDelete: (notification) => setDeleteTarget(notification),
		onMarkAsRead: (id) => markReadMutation.mutate(id),
	});

	return (
		<div className="space-y-6 p-6">
			<NotificationPageHeader
				markAllReadIsPending={markAllReadMutation.isPending}
				onMarkAllRead={() => markAllReadMutation.mutate()}
				onShowBulkDelete={() => setShowBulkDelete(true)}
				selectedCount={selectedRows.length}
				totalLabel={isLoading ? 'Loading…' : `${data?.total ?? 0} total notifications`}
			/>

			<NotificationStatsGrid stats={statsResponse?.data} />

			<NotificationFilters
				onReadFilterChange={(filter) => {
					setReadFilter(filter);
					void trackEvent({
						eventCategory: 'user_action',
						eventName: 'notification_filter_change',
						metadata: { filter: 'read', value: filter },
					});
				}}
				onTypeFilterChange={(filter) => {
					setTypeFilter(filter);
					void trackEvent({
						eventCategory: 'user_action',
						eventName: 'notification_filter_change',
						metadata: { filter: 'type', value: filter },
					});
				}}
				readFilter={readFilter}
				typeFilter={typeFilter}
			/>

			{isLoading ? (
				<TableSkeleton />
			) : (
				<DataTable
					columns={columns}
					data={data?.data ?? []}
					onRowSelectionChange={setSelectedRows}
					pagination={{
						limit,
						onPageChange: setPage,
						onPageSizeChange: setLimit,
						page,
						total: data?.total ?? 0,
					}}
				/>
			)}

			<NotificationDeleteDialogs
				bulkDeleteMutation={bulkDeleteMutation}
				deleteMutation={deleteMutation}
				deleteTarget={deleteTarget}
				onClearDeleteTarget={() => setDeleteTarget(null)}
				onClearSelectedRows={() => setSelectedRows([])}
				onShowBulkDeleteChange={setShowBulkDelete}
				selectedRows={selectedRows}
				showBulkDelete={showBulkDelete}
			/>
		</div>
	);
}

export { NotificationsPage };
