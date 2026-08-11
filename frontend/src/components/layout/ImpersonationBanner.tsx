import { useState } from 'react';

import { getMe } from '@/api/auth';
import { stopImpersonating } from '@/api/users';
import { Button } from '@/components/ui/button';
import { lazyToast } from '@/lib/lazyToast';
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
			lazyToast.success('Original session restored');
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to stop impersonation';
			lazyToast.error('Stop Impersonation Failed', { description: message });
		} finally {
			setIsStopping(false);
		}
	}

	return (
		<div className="border-b border-warning/20 bg-warning/10 px-4 py-1.5 text-center text-sm">
			<span className="font-medium text-warning">
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
