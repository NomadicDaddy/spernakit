import { useState } from 'react';
import { toast } from 'sonner';

import { getMe } from '@/api/auth';
import { stopImpersonating } from '@/api/users';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';

/**
 * Banner shown when a SYSOP is impersonating another user.
 * Provides a "Stop impersonating" button that restores the original session.
 */
function ImpersonationBanner() {
	const user = useAuthStore((s) => s.user);
	const setUser = useAuthStore((s) => s.setUser);
	const [isStopping, setIsStopping] = useState(false);

	if (!user?.impersonatedBy) return null;

	async function handleStop() {
		setIsStopping(true);
		try {
			await stopImpersonating();
			const me = await getMe();
			if (me) {
				setUser(me);
			}
			toast.success('Original session restored');
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to stop impersonation';
			toast.error('Stop Impersonation Failed', { description: message });
		} finally {
			setIsStopping(false);
		}
	}

	return (
		<div className="bg-warning/10 border-warning/20 border-b px-4 py-1.5 text-center text-sm">
			<span className="text-warning font-medium">
				Impersonating <strong>{user.username}</strong>
			</span>
			<Button
				className="ml-3 h-6 px-2 text-xs"
				disabled={isStopping}
				onClick={() => void handleStop()}
				size="sm"
				variant="outline">
				{isStopping ? 'Stopping…' : 'Stop Impersonating'}
			</Button>
		</div>
	);
}

export { ImpersonationBanner };
