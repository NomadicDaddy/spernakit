import { RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useBackendLiveness } from '@/hooks/useBackendLiveness';

/**
 * Destructive banner that surfaces backend unreachability to the user.
 *
 * Renders nothing until the first liveness probe settles so it does not flash
 * during page load, and disappears automatically within one poll cycle once the
 * backend recovers.
 */
function BackendUnreachableBanner() {
	const { isReachable, lastCheckedAt, refetch } = useBackendLiveness();

	if (lastCheckedAt === null || isReachable) {
		return null;
	}

	return (
		<Alert className="mb-4" variant="destructive">
			<AlertTitle>Backend unreachable</AlertTitle>
			<AlertDescription>
				The server is unreachable — sign-in and data operations will fail until it returns.
				<Button
					className="mt-2"
					onClick={refetch}
					size="sm"
					type="button"
					variant="secondary">
					<RefreshCw aria-hidden="true" className="mr-2 size-4" />
					Retry now
				</Button>
			</AlertDescription>
		</Alert>
	);
}

export { BackendUnreachableBanner };
