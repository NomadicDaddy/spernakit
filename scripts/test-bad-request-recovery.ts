#!/usr/bin/env bun
/**
 * Regression coverage for a rejected filter leaving the page it came from usable.
 *
 * The defect this gate was written for: a GET that the API answered 400 was retried three times
 * with exponential backoff and then thrown into the nearest ErrorBoundary, while the global toast
 * stayed deliberately silent on 400. Settings > Users showed it plainly. Opening
 * `/settings/users?role=manager`, with the lowercase spelling a hand-edited or stale link carries,
 * spent about seven seconds rendering skeletons and then replaced the table, the search box, the
 * role filter and the Create User button with a generic message, with nothing anywhere naming the
 * filter that caused it. The only way back was to edit the URL. Two applications in the fleet
 * reported it, one on the users list and one on an asset list, and both described the same thing:
 * a blank panel, no message, no toast, no retry.
 *
 * The property under test is that a refusal the server will repeat is treated as an answer rather
 * than as a fault: not retried, not escalated past the page, and not silent. Everything else keeps
 * the behavior it had, which is the half worth guarding — a 500 is still transient and still
 * unexpected, a 429 is still left to the fetch layer, and 401, 403 and 404 still belong to the code
 * that already handles them.
 *
 * Runs in process against `queryErrorPolicy.ts`, which is why that module holds the rules and takes
 * a plain status rather than an `ApiError`. The two source scans cover the wiring an assertion here
 * cannot reach: that the query cache is the caller of the query-specific toast, and that the
 * mutation path is still the quiet one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	type FailedResponse,
	shouldRetryFailedQuery,
	shouldThrowFailedQuery,
} from '../frontend/src/lib/queryErrorPolicy.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

function response(status: number, code?: string): FailedResponse {
	return { code, status };
}

/** The refusal is final, so asking again is only a delay. */
function aRejectedFilterIsNotRetried(): void {
	const badRequest = response(400, 'VALIDATION_FAILED');
	assert(
		!shouldRetryFailedQuery(0, badRequest),
		'a 400 is retried, so a rejected filter still costs the user a backoff wait before failing',
	);
	assert(
		!shouldRetryFailedQuery(2, badRequest),
		'a 400 is retried on a later attempt, so the no-retry rule is not reached from every count',
	);
}

/** The page can render without the rows; the boundary cannot render the page. */
function aRejectedFilterDoesNotBlankThePage(): void {
	assert(
		!shouldThrowFailedQuery(response(400, 'VALIDATION_FAILED')),
		'a 400 is thrown into the ErrorBoundary, which replaces the page that could have recovered',
	);
	assert(
		!shouldThrowFailedQuery(response(400)),
		'a 400 with no error code is still thrown, so the rule reads the code rather than the status',
	);
}

/** Every other status keeps the treatment it had. */
function nothingElseChanged(): void {
	assert(
		shouldRetryFailedQuery(0, response(500, 'SERVER_INTERNAL_ERROR')),
		'a 500 is no longer retried, so a transient server fault fails on the first attempt',
	);
	assert(
		!shouldRetryFailedQuery(3, response(500, 'SERVER_INTERNAL_ERROR')),
		'a 500 retries past the third attempt',
	);
	assert(
		!shouldRetryFailedQuery(0, response(429, 'RATE_API_LIMIT_EXCEEDED')),
		'a 429 is retried here as well as in the fetch layer, which widens the rate-limit window',
	);
	assert(
		!shouldRetryFailedQuery(0, response(404, 'RESOURCE_NOT_FOUND')),
		'a 404 is retried, so a deleted record costs a backoff wait before the page can say so',
	);

	assert(
		shouldThrowFailedQuery(response(500, 'SERVER_INTERNAL_ERROR')),
		'a 500 no longer reaches the ErrorBoundary, so an unexpected fault renders as an empty page',
	);
	assert(
		!shouldThrowFailedQuery(response(401, 'AUTH_TOKEN_EXPIRED')),
		'a 401 reaches the ErrorBoundary instead of the refresh and redirect that handle it',
	);
	assert(
		!shouldThrowFailedQuery(response(403, 'AUTH_PERMISSION_DENIED')),
		'a 403 reaches the ErrorBoundary instead of the page-level permission check',
	);
	assert(
		!shouldThrowFailedQuery(response(404, 'RESOURCE_NOT_FOUND')),
		'a 404 reaches the ErrorBoundary instead of the page own not-found branch',
	);
}

/**
 * The toast is the whole explanation for a failed read, so the query cache has to be the one
 * asking for it. Routing the query cache through the mutation toast puts the silence back.
 */
function theQueryCacheAsksForTheQueryToast(): void {
	const text = readFileSync(join(repoRoot, 'frontend', 'src', 'lib', 'queryClient.ts'), 'utf8');
	const queryCacheAt = text.indexOf('queryCache:');
	const mutationCacheAt = text.indexOf('mutationCache:');

	assert(queryCacheAt >= 0, 'queryClient.ts no longer configures a queryCache');
	assert(mutationCacheAt >= 0, 'queryClient.ts no longer configures a mutationCache');
	if (queryCacheAt < 0 || mutationCacheAt < 0) return;

	assert(
		text.slice(queryCacheAt).includes('showQueryErrorToast('),
		'the query cache does not call showQueryErrorToast, so a rejected read reports nothing',
	);
	assert(
		!text
			.slice(mutationCacheAt, queryCacheAt > mutationCacheAt ? queryCacheAt : text.length)
			.includes('showQueryErrorToast('),
		'the mutation cache calls the query toast, which talks about the address over a form',
	);
}

/**
 * The mutation path stays quiet on 400 on purpose: a form's field-level messages say more than a
 * generic toast, and adding 400 to the shared status map would put a second, vaguer message on top
 * of every rejected submission in the application.
 */
function theMutationPathStaysQuiet(): void {
	const text = readFileSync(join(repoRoot, 'frontend', 'src', 'api', 'errorHandling.ts'), 'utf8');
	const mapAt = text.indexOf('const STATUS_MESSAGES');
	assert(mapAt >= 0, 'errorHandling.ts no longer declares STATUS_MESSAGES');
	if (mapAt < 0) return;

	const map = text.slice(mapAt, text.indexOf(']);', mapAt));
	assert(
		!map.includes('[400,'),
		'400 was added to the shared status map, which puts a generic toast over every form error',
	);
	assert(
		text.includes('function showQueryErrorToast('),
		'showQueryErrorToast is gone, so nothing reports a rejected read',
	);
}

function run(): void {
	aRejectedFilterIsNotRetried();
	aRejectedFilterDoesNotBlankThePage();
	nothingElseChanged();
	theQueryCacheAsksForTheQueryToast();
	theMutationPathStaysQuiet();

	if (failures.length === 0) {
		console.log('[OK] bad-request-recovery: a rejected filter leaves its page usable');
		process.exit(0);
	}
	console.error('[FAIL] bad-request-recovery:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run();
