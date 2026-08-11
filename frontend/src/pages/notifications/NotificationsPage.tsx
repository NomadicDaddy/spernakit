import { useQuery } from '@tanstack/react-query';
import { BellOff, CheckCheck, Trash2 } from 'lucide-react';
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
import { type ReadFilter, useNotifications } from '@/hooks/notifications/useNotifications';
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
	statsLoading,
	unreadCount,
}: {
	markAllReadIsPending: boolean;
	onMarkAllRead: () => void;
	onShowBulkDelete: () => void;
	selectedCount: number;
	statsLoading: boolean;
	unreadCount: number;
}) {
	return (
		/*
		 * The description no longer prints a count. It said "N total notifications" directly above a
		 * Total tile saying the same thing, and the table's own pagination summary states the
		 * filtered count — three renderings of one number down the same column.
		 */
		<PageHeader description="Alerts and messages for your workspace" title="Notifications">
			{/*
			 * Hidden rather than permanently disabled. With nothing unread this rendered as a greyed
			 * control in the page's most prominent action slot, and the only explanation — "There
			 * are no unread notifications." — lived in an sr-only span. A `title` would not have
			 * fixed that: the Button sets `disabled:pointer-events-none`, so a native tooltip never
			 * fires on it. An action that cannot apply is better absent than dead, and the Unread
			 * tile beside it already says why.
			 */}
			{(statsLoading || unreadCount > 0) && (
				<Button
					disabled={statsLoading || markAllReadIsPending}
					onClick={onMarkAllRead}
					size="sm"
					variant="outline">
					<CheckCheck aria-hidden="true" className="size-4" />
					Mark all read
				</Button>
			)}
			{selectedCount > 0 && (
				<Button onClick={onShowBulkDelete} size="sm" variant="destructive">
					<Trash2 aria-hidden="true" className="size-4" />
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
				description={`Are you sure you want to delete “${deleteTarget?.title}”? This action cannot be undone.`}
				isOpen={!!deleteTarget}
				isPending={deleteMutation.isPending}
				onConfirm={() => {
					if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
				}}
				onOpenChange={(open) => {
					if (!open) onClearDeleteTarget();
				}}
				title="Delete notification"
				variant="destructive"
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
						},
					);
				}}
				onOpenChange={onShowBulkDeleteChange}
				title={`Delete ${selectedRows.length} notifications`}
				variant="destructive"
			/>
		</>
	);
}

function NotificationsPage() {
	const { getFilter, limit, page, setFilter, setFilters, setLimit, setPage } = useUrlFilters(20);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);

	const readParam = getFilter('read', 'all');
	const readFilter: ReadFilter = VALID_READ_FILTERS.has(readParam)
		? (readParam as ReadFilter)
		: 'all';
	const typeFilter = getFilter('type', 'all');

	const setReadFilter = (filter: ReadFilter) => setFilter('read', filter === 'all' ? '' : filter);
	const setTypeFilter = (filter: string) => setFilter('type', filter === 'all' ? '' : filter);

	const [selectedRows, setSelectedRows] = useState<Notification[]>([]);
	const [selectionResetToken, setSelectionResetToken] = useState(0);
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

	const { data: statsResponse, isLoading: statsLoading } = useQuery<
		DataResponse<NotificationStatistics>
	>({
		enabled: activeWorkspaceId !== null,
		queryFn: getNotificationStatistics,
		queryKey: notificationKeys.statistics(activeWorkspaceId),
		staleTime: STALE_TIME_SHORT,
	});

	// Selection is held here but rendered by the table, and the table unmounts while a
	// new page loads. Clearing both together keeps the header's Delete button from
	// offering rows the user can no longer see or uncheck.
	function clearSelection() {
		setSelectedRows([]);
		setSelectionResetToken((token) => token + 1);
	}

	const columns = useNotificationColumns({
		enableSelection: true,
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
				statsLoading={statsLoading}
				unreadCount={statsResponse?.data.unread ?? 0}
			/>

			<NotificationStatsGrid stats={statsResponse?.data} />

			{isLoading ? (
				<TableSkeleton />
			) : (
				<DataTable
					columns={columns}
					data={data?.data ?? []}
					empty={{
						description:
							'Alerts about your workspace arrive here. There is nothing to catch up on.',
						icon: BellOff,
						// Both filters are server-side, so the table cannot read them itself.
						isFiltered: readFilter !== 'all' || typeFilter !== 'all',
						onClearFilters: () => {
							setFilters((params) => {
								params.delete('read');
								params.delete('type');
								params.delete('page');
							});
						},
						title: 'You are all caught up',
					}}
					onRowSelectionChange={setSelectedRows}
					pagination={{
						limit,
						onPageChange: (nextPage) => {
							setPage(nextPage);
							clearSelection();
						},
						onPageSizeChange: setLimit,
						page,
						total: data?.total ?? 0,
					}}
					selectionResetToken={selectionResetToken}
					toolbar={
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
							typeCounts={statsResponse?.data.byType}
							typeFilter={typeFilter}
						/>
					}
				/>
			)}

			<NotificationDeleteDialogs
				bulkDeleteMutation={bulkDeleteMutation}
				deleteMutation={deleteMutation}
				deleteTarget={deleteTarget}
				onClearDeleteTarget={() => setDeleteTarget(null)}
				onClearSelectedRows={clearSelection}
				onShowBulkDeleteChange={setShowBulkDelete}
				selectedRows={selectedRows}
				showBulkDelete={showBulkDelete}
			/>
		</div>
	);
}

export { NotificationsPage };
