import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/apiError';
import { showErrorToast, showQueryErrorToast } from '@/api/errorHandling';
import {
	type FailedResponse,
	shouldRetryFailedQuery,
	shouldThrowFailedQuery,
} from '@/lib/queryErrorPolicy';

/**
 * Read the status and code out of a caught error, or nothing if it did not come from the API.
 *
 * A failure that is not an `ApiError` never reached the server: a network drop, a parse fault, a
 * bug in the query function. None of the policy rules in `queryErrorPolicy.ts` have anything to say
 * about those, so they keep the default treatment of retrying and then throwing.
 */
function asFailedResponse(error: Error): FailedResponse | null {
	if (!(error instanceof ApiError)) return null;
	return { code: error.code, status: error.status };
}

function shouldRetryQuery(failureCount: number, error: Error): boolean {
	const failure = asFailedResponse(error);
	if (!failure) return failureCount < 3;
	return shouldRetryFailedQuery(failureCount, failure);
}

function shouldThrowOnError(error: Error): boolean {
	const failure = asFailedResponse(error);
	if (!failure) return true;
	return shouldThrowFailedQuery(failure);
}

/**
 * Global QueryClient with optimized defaults for caching and deduplication.
 *
 * - staleTime: Data is fresh for 5 minutes (reduces refetches)
 * - gcTime: Cached data retained for 10 minutes after becoming unused
 * - retry / throwOnError: decided by `queryErrorPolicy.ts`
 * - mutations never retry at the TanStack level — POSTs are not idempotent and
 *   the fetch layer already handles GET-only 5xx retry
 * - refetchOnWindowFocus: Disabled to prevent unnecessary network traffic
 * - Global error toasts fire from the caches (once per failure, after retries);
 *   mutations with their own onError handler suppress the global toast
 *
 * TanStack Query automatically deduplicates in-flight requests with the same query key.
 */
const queryClient = new QueryClient({
	defaultOptions: {
		mutations: {
			retry: 0,
		},
		queries: {
			gcTime: 10 * 60 * 1000, // 10 minutes cache retention
			refetchOnWindowFocus: false,
			retry: shouldRetryQuery,
			retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30_000),
			staleTime: 5 * 60 * 1000, // 5 minutes before data is considered stale
			throwOnError: shouldThrowOnError,
		},
	},
	mutationCache: new MutationCache({
		onError: (error, _variables, _context, mutation) => {
			// Mutations with a local onError handler own their user-facing messaging.
			if (mutation.options.onError) return;
			if (error instanceof ApiError) {
				showErrorToast(error.status, error.code, error.details);
			}
		},
	}),
	queryCache: new QueryCache({
		onError: (error) => {
			// The query path, not the mutation path: a failed GET has no form behind it, so it
			// needs the toast to say something even where a mutation would stay quiet.
			if (error instanceof ApiError) {
				showQueryErrorToast(error.status, error.code, error.details);
			}
		},
	}),
});

export { queryClient };
