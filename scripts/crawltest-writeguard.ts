/**
 * Network-layer read-only guard for crawltest.
 *
 * The crawl's original protection against changing data was `SKIP_PATTERNS` — a list of anchored
 * regexes matched against a control's visible text. That guard is structurally unable to hold. It
 * sees only what a control is *labelled*, so an icon-only button with no accessible name matches
 * nothing and is clicked; and `testSwitch` toggles switches deliberately, which is how a crawl run
 * came to leave `PUT /api/v1/health/config` and `PATCH /api/v1/tasks/token-cleanup` behind it.
 *
 * A label is a guess about what a control does. The HTTP method is the fact. This guard sits at the
 * one place every mutation must pass through and refuses it there, so a new page, a new icon button
 * or a new switch cannot quietly reopen the hole.
 *
 * Blocked requests are answered with a synthetic 403 in the API's own error envelope rather than
 * aborted: an aborted fetch surfaces to the app as a network failure, and the crawl's whole job is
 * to notice network failures. The response carries `x-crawltest-blocked`, which is how
 * crawltest-events.ts tells this run's own refusals apart from the app's.
 */
import type { HTTPRequest, Page } from 'puppeteer';

import type { CrawlerState } from './crawltest-types';

/** Response header marking a refusal as this guard's own, not the application's. */
export const BLOCKED_HEADER = 'x-crawltest-blocked';

/** Methods that cannot change server state. */
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * The only writes the crawl genuinely needs. Without a session it reaches the public routes and
 * reports a shallow pass, so authentication is allowed through; nothing else is. Logout and refresh
 * are here because `recycleBrowser` re-logs in mid-crawl — they end or extend a session and leave no
 * durable record behind.
 */
const WRITE_ALLOWLIST: RegExp[] = [/^\/api\/v\d+\/auth\/(?:login|logout|refresh)$/];

/**
 * Writes a flag explicitly asks for. `--bug` exists to submit a bug report, so blocking that one
 * POST would leave the flag doing nothing but reporting its own failure.
 */
export const BUG_REPORT_WRITE = /^\/api\/v\d+\/bugs$/;

function isApiPath(pathname: string): boolean {
	return pathname.startsWith('/api/');
}

/** Whether this request would change server state and is not one of the allowed exceptions. */
function isBlockedWrite(
	request: HTTPRequest,
	extraAllowed: RegExp[],
): { method: string; pathname: string } | null {
	const method = request.method().toUpperCase();
	if (READ_METHODS.has(method)) return null;

	let pathname: string;
	try {
		pathname = new URL(request.url()).pathname;
	} catch {
		return null;
	}

	if (!isApiPath(pathname)) return null;
	if (WRITE_ALLOWLIST.some((p) => p.test(pathname))) return null;
	if (extraAllowed.some((p) => p.test(pathname))) return null;
	return { method, pathname };
}

/**
 * Refuse every state-changing API request for the lifetime of this page.
 *
 * Installed from `launchSession`, which is the single place a page is created — including the pages
 * `recycleBrowser` makes mid-crawl, so the guard survives a recycle without a second call site.
 */
export async function installWriteGuard(
	page: Page,
	state: CrawlerState,
	extraAllowed: RegExp[] = [],
): Promise<void> {
	await page.setRequestInterception(true);

	page.on('request', (request) => {
		void (async () => {
			try {
				const blocked = isBlockedWrite(request, extraAllowed);
				if (!blocked) {
					await request.continue();
					return;
				}

				state.blockedWrites.push({
					method: blocked.method,
					pathname: blocked.pathname,
					timestamp: new Date().toISOString(),
				});

				await request.respond({
					body: JSON.stringify({
						code: 'AUTH_PERMISSION_DENIED',
						error: 'Forbidden',
						message:
							'Blocked by the crawltest read-only guard. Re-run with --allow-writes.',
					}),
					contentType: 'application/json',
					headers: { [BLOCKED_HEADER]: '1' },
					status: 403,
				});
			} catch {
				// The request may already be handled or the page torn down mid-navigation. Either way
				// there is nothing left to answer, and throwing here would stall the page for good.
			}
		})();
	});
}

/** One line per distinct endpoint the guard refused, for the end-of-run summary. */
export function summarizeBlockedWrites(state: CrawlerState): string[] {
	const counts = new Map<string, number>();
	for (const write of state.blockedWrites) {
		const key = `${write.method} ${write.pathname}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.map(([key, count]) => (count > 1 ? `${key} (${String(count)}×)` : key));
}
