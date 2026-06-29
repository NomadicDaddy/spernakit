import { useQuery } from '@tanstack/react-query';

import { apiClient } from '@/api/client';
import { useWsStore } from '@/stores/wsStore';

interface HealthResponse {
	lastChecked: string;
	schemaVersion: string;
	status: 'degraded' | 'healthy' | 'unhealthy';
}

interface UseBackendLivenessResult {
	isReachable: boolean;
	lastCheckedAt: Date | null;
	refetch: () => void;
}

const BACKEND_LIVENESS_POLL_MS = 15_000;

/**
 * Polls the unauthenticated `/health` endpoint on an interval and exposes a simple
 * reachability flag the UI can use to render a backend-unreachable banner.
 *
 * Any successful HTTP response counts as reachable — the banner's job is to flag
 * transport failure (fetch rejection, non-2xx), not to surface the server's own
 * self-reported health status. A backend that answers `/health` with
 * `status: "unhealthy"` is still reachable; a separate indicator should surface
 * degraded/unhealthy state. `lastCheckedAt` is `null` until the first probe settles,
 * which the banner uses to avoid flashing on the very first render.
 */
function useBackendLiveness(): UseBackendLivenessResult {
	const wsConnected = useWsStore((s) => s.connectionState === 'connected');
	const query = useQuery<HealthResponse>({
		queryFn: () => apiClient.get<HealthResponse>('/health'),
		queryKey: ['backend-liveness'],
		refetchInterval: wsConnected ? false : BACKEND_LIVENESS_POLL_MS,
		refetchOnWindowFocus: true,
		retry: 1,
		throwOnError: false,
	});

	const isReachable = query.isSuccess;

	const lastCheckedAt =
		query.dataUpdatedAt > 0
			? new Date(query.dataUpdatedAt)
			: query.errorUpdatedAt > 0
				? new Date(query.errorUpdatedAt)
				: null;

	return {
		isReachable,
		lastCheckedAt,
		refetch: () => {
			void query.refetch();
		},
	};
}

export { useBackendLiveness };
