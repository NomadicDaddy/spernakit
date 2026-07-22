import { useQuery } from '@tanstack/react-query';

import type { RuntimeConfigSnapshot } from '@/api/runtimeConfig';
import type { DataResponse } from '@/api/types';

import { getRuntimeConfig } from '@/api/runtimeConfig';

/**
 * Fetch the redacted runtime configuration snapshot (SYSOP-only endpoint).
 * Pass `enabled: false` for non-SYSOP viewers so the query never fires a 403.
 * Config is static for the lifetime of the process, so it is cached generously.
 */
export function useRuntimeConfig(enabled = true) {
	return useQuery<DataResponse<RuntimeConfigSnapshot>>({
		enabled,
		queryFn: getRuntimeConfig,
		queryKey: ['runtime-config'],
		staleTime: 5 * 60 * 1000,
	});
}
