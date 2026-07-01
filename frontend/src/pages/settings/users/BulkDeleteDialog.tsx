import type { User } from '@/api/types';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';

type BulkDeleteDialogProps = {
	isPending: boolean;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	selectedRows: User[];
};

function BulkDeleteDialog({
	isPending,
	onConfirm,
	onOpenChange,
	open,
	selectedRows,
}: BulkDeleteDialogProps) {
	return (
		<ConfirmAlertDialog
			confirmText="Delete"
			description={`This will soft-delete the selected users. Users with equal or higher roles will be skipped.`}
			isOpen={open}
			isPending={isPending}
			onConfirm={onConfirm}
			onOpenChange={onOpenChange}
			title={`Delete ${selectedRows.length} users?`}
		/>
	);
}

export { BulkDeleteDialog };
