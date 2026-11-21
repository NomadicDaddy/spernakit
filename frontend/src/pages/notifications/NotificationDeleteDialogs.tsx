import type { Notification } from '@/api/types';
import type { useNotifications } from '@/hooks/notifications/useNotifications';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';

/** The single and bulk delete confirmations for the Notifications page. */
export function NotificationDeleteDialogs({
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
