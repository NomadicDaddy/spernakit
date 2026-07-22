import { useState } from 'react';
import { toast } from 'sonner';

import type { User } from '@/api/types';

import { getMe } from '@/api/auth';
import { impersonateUser } from '@/api/users';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { useAuthStore } from '@/stores/authStore';

interface ImpersonateDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	user: null | User;
}

function ImpersonateDialog({ isOpen, onOpenChange, user }: ImpersonateDialogProps) {
	const [isPending, setIsPending] = useState(false);
	const currentUser = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);

	async function handleConfirm() {
		if (!user) return;

		// Defense-in-depth self-guard
		if (currentUser?.id === user.id) {
			toast.error('Cannot impersonate yourself');
			return;
		}

		setIsPending(true);
		try {
			// First call the impersonation endpoint — only proceed on success
			await impersonateUser(user.id);

			// After successful impersonation, refetch /auth/me to get the impersonated user data
			const me = await getMe();
			if (me) {
				setUser(me);
			}

			toast.success(`Now impersonating ${user.username}`);
			onOpenChange(false);
		} catch (err) {
			// Do NOT mutate auth store on failure
			const message = err instanceof Error ? err.message : 'Failed to impersonate user';
			toast.error('Impersonation Failed', { description: message });
		} finally {
			setIsPending(false);
		}
	}

	return (
		<ConfirmAlertDialog
			confirmText="Impersonate"
			description={`You will be logged in as ${user?.username} for troubleshooting. Your original session will be preserved and can be restored at any time.`}
			isOpen={isOpen}
			isPending={isPending}
			onConfirm={() => void handleConfirm()}
			onOpenChange={onOpenChange}
			title="Impersonate User"
		/>
	);
}

export { ImpersonateDialog };
