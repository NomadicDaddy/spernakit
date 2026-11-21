import { useQuery } from '@tanstack/react-query';
import { BellOff, Trash2 } from 'lucide-react';
import { useState } from 'react';

import type { DataResponse, Notification, NotificationStatistics } from '@/api/types';

import { trackEvent } from '@/api/businessMetrics';
import { getNotificationStatistics, notificationKeys } from '@/api/notifications';
import { BulkActionBar } from '@/components/shared/data-table/BulkActionBar';
import { DataTable } from '@/components/shared/data-table/DataTable';
import { TableSkeleton } from '@/components/shared/skeletons/TableSkeleton';
import { Button } from '@/components/ui/button';
import { useNotificationColumns } from '@/hooks/notifications/useNotificationColumns';
import { type ReadFilter, useNotifications } from '@/hooks/notifications/useNotifications';
import { useUrlFilters } from '@/hooks/useUrlFilters';
import { useUrlSorting } from '@/hooks/useUrlSorting';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { useWorkspaceStore } from '@/stores/workspaceStore';

import { NotificationDeleteDialogs } from './NotificationDeleteDialogs';
import { NotificationFilters } from './NotificationFilters';
import { NotificationPageHeader } from './NotificationPageHeader';
import { NotificationStatsGrid } from './NotificationStatsGrid';

const VALID_READ_FILTERS = new Set<string>(['all', 'read', 'unread']);

function NotificationsPage() {
	const { getFilter, limit, page, setFilter, setFilters, setLimit, setPage } = useUrlFilters();
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

	// Newest first, matching what the API does when asked for nothing.
	const { onSortingChange, sortBy, sortDir, sorting } = useUrlSorting(
		'createdAt',
		clearSelection,
	);

	const {
		bulkDeleteMutation,
		data,
		deleteMutation,
		isLoading,
		markAllReadMutation,
		markReadMutation,
	} = useNotifications({ limit, page, readFilter, sortBy, sortDir, typeFilter });

	const { data: statsResponse, isLoading: statsLoading } = useQuery<
		DataResponse<NotificationStatistics>
	>({
		enabled: activeWorkspaceId !== null,
		queryFn: getNotificationStatistics,
		queryKey: notificationKeys.statistics(activeWorkspaceId),
		staleTime: STALE_TIME_SHORT,
	});

	const notifications = data?.data ?? [];

	// Both filters are server-side, so `notifications` is exactly what is on screen and a selected
	// row missing from it is one the reader cannot see or untick. See UsersTab for the full note.
	const visibleIds = new Set(notifications.map((n) => n.id));
	const hiddenSelectedCount = selectedRows.filter((n) => !visibleIds.has(n.id)).length;

	function clearFilters() {
		setFilters((params) => {
			params.delete('read');
			params.delete('type');
			params.delete('page');
		});
	}

	// Selection is held here but rendered by the table, and the table unmounts while a
	// new page loads. Clearing both together keeps the bulk bar from offering rows the
	// user can no longer see or uncheck.
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
				statsLoading={statsLoading}
				unreadCount={statsResponse?.data.unread ?? 0}
			/>

			<NotificationStatsGrid stats={statsResponse?.data} />

			{isLoading ? (
				<TableSkeleton />
			) : (
				<DataTable
					columns={columns}
					data={notifications}
					empty={{
						description:
							'Alerts about your workspace arrive here. There is nothing to catch up on.',
						icon: BellOff,
						// Both filters are server-side, so the table cannot read them itself.
						isFiltered: readFilter !== 'all' || typeFilter !== 'all',
						onClearFilters: clearFilters,
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
						onSortingChange,
						page,
						sorting,
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

			{/* See UsersTab: the empty state owns Clear filters while it is showing, so the bar
			 * offers its own only while rows are on screen. */}
			{!isLoading && (
				<BulkActionBar
					hiddenCount={hiddenSelectedCount}
					{...(notifications.length > 0 ? { onClearFilters: clearFilters } : {})}
					selectedCount={selectedRows.length}>
					<Button onClick={() => setShowBulkDelete(true)} size="sm" variant="destructive">
						<Trash2 aria-hidden="true" className="size-4" />
						Delete Selected
					</Button>
				</BulkActionBar>
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
