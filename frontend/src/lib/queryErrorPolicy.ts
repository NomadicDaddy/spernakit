/**
 * What the application does with a request the server refused.
 *
 * These are decisions, not plumbing, and they are kept here as plain functions over a status and
 * an error code so that the rules can be read and tested without starting React, a query client or
 * a toast library. `queryClient.ts` is the only caller; it adapts a caught `ApiError` into the
 * shape below and wires the answers into TanStack Query.
 */

/** The part of a failed response these decisions are allowed to look at. */
interface FailedResponse {
	code: string | undefined;
	status: number;
}

/**
 * A 404 is an answer, not a failure.
 *
 * The resource is not there, and neither asking again nor escalating to an error boundary changes
 * that. Both rules below consult this one predicate so the behavior is decided once rather than per
 * page: a page added later gets it without opting in, and a page cannot opt out of it by accident.
 * Opening a deleted dashboard used to spend three retries with exponential backoff on a response
 * that was already final, and then throw past the page's own not-found branch into the error
 * boundary, which is how a deleted dashboard ended up showing several seconds of skeleton followed
 * by a generic failure.
 */
function isNotFound(failure: FailedResponse): boolean {
	return failure.status === 404;
}

/**
 * A 400 is the server saying it will not accept this request as written.
 *
 * The same request sent again is refused the same way, so there is nothing to wait out and nothing
 * an error boundary can repair. A query reaches one of these when the address carries a filter or
 * page value the API does not accept: an enum spelled in the wrong case, a value renamed since the
 * link was saved, a page size past the ceiling. The page that read those values from the URL is
 * still perfectly able to render, and its own empty state already offers a way to clear the
 * filters, so blanking it is strictly worse than letting it render.
 *
 * Settings > Users demonstrated the old behavior: `?role=manager` spent about seven seconds in
 * three retries, then threw into the boundary, which replaced the table, the search box, the role
 * filter and the Create User button with a generic message. The only way back was to edit the URL.
 */
function isBadRequest(failure: FailedResponse): boolean {
	return failure.status === 400;
}

/**
 * Never retry 429 at this level: the fetch-level retryHandler already retries 429 with Retry-After
 * backoff, and stacking retries on top of that only widens the rate-limit window. A 404 and a 400
 * are final answers rather than transient ones and are not retried either.
 */
function shouldRetryFailedQuery(failureCount: number, failure: FailedResponse): boolean {
	if (failure.status === 429) return false;
	if (isNotFound(failure)) return false;
	if (isBadRequest(failure)) return false;
	return failureCount < 3;
}

/**
 * Throw query errors into the nearest React ErrorBoundary so pages that don't explicitly handle
 * `isError` still show a recoverable "Something went wrong" fallback instead of an empty or stale
 * content area.
 *
 * Only consulted after all retries are exhausted. Does not throw for 401 (handled by token refresh
 * and redirect) or 403 (permission checks are page-level concerns), nor for 404, which every page
 * that can receive one reports itself, nor for 400, which the page can outlive. Anything still
 * thrown from here is genuinely unexpected, and the boundary's visible fallback is the right answer
 * to it.
 */
function shouldThrowFailedQuery(failure: FailedResponse): boolean {
	if (failure.status === 401 || failure.status === 403) return false;
	if (isNotFound(failure)) return false;
	if (isBadRequest(failure)) return false;
	return true;
}

export { type FailedResponse, shouldRetryFailedQuery, shouldThrowFailedQuery };
