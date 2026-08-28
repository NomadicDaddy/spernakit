import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';

import { ApiError } from '@/api/apiError';
import { showErrorToast } from '@/api/errorHandling';

/**
 * A 404 is an answer, not a failure.
 *
 * The resource is not there, and neither asking again nor escalating to an error boundary changes
 * that. Both of the rules below consult this one predicate so the behavior is decided once here
 * rather than per page: a page added later gets it without opting in, and a page cannot opt out of
 * it by accident. Opening a deleted dashboard used to spend three retries with exponential backoff
 * on a response that was already final, and then throw past the page's own not-found branch into
 * the error boundary, which is how a deleted dashboard ended up showing several seconds of skeleton
 * followed by a generic failure.
 */
function isNotFound(error: Error): boolean {
	return error instanceof ApiError && error.status === 404;
}

/**
 * Never retry 429 at the TanStack level — the fetch-level retryHandler already
 * retries 429 with Retry-After backoff. Stacking TanStack retries on top would
 * only worsen the rate-limit window.
 */
function shouldRetryQuery(failureCount: number, error: Error): boolean {
	if (error instanceof ApiError && error.status === 429) return false;
	if (isNotFound(error)) return false;
	return failureCount < 3;
}

/**
 * Throw query errors into the nearest React ErrorBoundary so pages that don't
 * explicitly handle `isError` still show a recoverable "Something went wrong"
 * fallback instead of an empty or stale content area.
 *
 * Only throws after all retries are exhausted (TanStack calls this on final failure).
 * Does not throw for 401 (handled by token refresh / redirect) or 403 (permission
 * checks are page-level concerns), nor for 404, which every page that can receive one
 * reports itself. A thrown 404 reaches the boundary as an unexplained failure and takes
 * the page's own not-found branch out of the running; returned as a result, the page can
 * say which thing was not found and offer the way back. Anything still thrown from here
 * is genuinely unexpected, and the boundary's visible fallback is the right answer to it.
 */
function shouldThrowOnError(error: Error): boolean {
	if (error instanceof ApiError) {
		if (error.status === 401 || error.status === 403) return false;
	}
	return !isNotFound(error);
}

/** Show the global error toast for API errors — fires once, after retries are exhausted. */
function toastApiError(error: Error): void {
	if (error instanceof ApiError) {
		showErrorToast(error.status, error.code, error.details);
	}
}

/**
 * Global QueryClient with optimized defaults for caching and deduplication.
 *
 * - staleTime: Data is fresh for 5 minutes (reduces refetches)
 * - gcTime: Cached data retained for 10 minutes after becoming unused
 * - retry: Failed queries retry 3 times with exponential backoff, except 429
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
			toastApiError(error);
		},
	}),
	queryCache: new QueryCache({
		onError: (error) => {
			toastApiError(error);
		},
	}),
});

export { queryClient };
