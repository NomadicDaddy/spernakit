import type { User } from '@/api/types';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';

interface DeleteUserDialogProps {
	isOpen: boolean;
	isPending: boolean;
	onConfirm: (id: number) => void;
	onOpenChange: (open: boolean) => void;
	user: null | User;
}

export function DeleteUserDialog({
	isOpen,
	isPending,
	onConfirm,
	onOpenChange,
	user,
}: DeleteUserDialogProps) {
	return (
		<ConfirmAlertDialog
			confirmText="Delete"
			description={`Are you sure you want to delete ${user?.username}? This action will soft-delete user account.`}
			isOpen={isOpen}
			isPending={isPending}
			onConfirm={() => {
				if (user) onConfirm(user.id);
			}}
			onOpenChange={onOpenChange}
			title="Delete User"
		/>
	);
}
