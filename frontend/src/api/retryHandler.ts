import { DEFAULT_API_TIMEOUT_MS } from 'spernakit-shared';

const RETRY_MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 500;
const RETRY_MAX_DELAY_MS = 5000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function withTimeout(timeoutMs?: number): { cleanup: () => void; signal: AbortSignal } {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs ?? DEFAULT_API_TIMEOUT_MS);
	return { cleanup: () => clearTimeout(id), signal: controller.signal };
}

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Compute retry delay with exponential backoff, full jitter, and Retry-After support. */
function getRetryDelay(attempt: number, res: Response): number {
	const retryAfter = res.headers.get('Retry-After');
	if (retryAfter) {
		const seconds = Number(retryAfter);
		if (!Number.isNaN(seconds) && seconds > 0) {
			return Math.min(seconds * 1000, RETRY_MAX_DELAY_MS);
		}
		const date = Date.parse(retryAfter);
		if (!Number.isNaN(date)) {
			const delayMs = date - Date.now();
			if (delayMs > 0) return Math.min(delayMs, RETRY_MAX_DELAY_MS);
		}
	}
	const exponential = RETRY_BASE_DELAY_MS * 2 ** attempt;
	const capped = Math.min(exponential, RETRY_MAX_DELAY_MS);
	return Math.random() * capped;
}

/** Retry a fetch call on transient errors (429, 5xx) with exponential backoff. */
async function fetchWithRetry(
	url: string,
	options: RequestInit,
	shouldRetry: boolean,
	timeoutMs: number
): Promise<Response> {
	let res = await fetch(url, options);

	if (!shouldRetry || !RETRYABLE_STATUS.has(res.status)) return res;

	for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
		if (options.signal?.aborted) return res;

		const delayMs = getRetryDelay(attempt, res);
		await delay(delayMs);

		const retryController = new AbortController();
		const retryTimeout = setTimeout(() => retryController.abort(), timeoutMs);

		try {
			res = await fetch(url, { ...options, signal: retryController.signal });
		} catch (err) {
			if (err instanceof DOMException && err.name === 'AbortError') return res;
			throw err;
		} finally {
			clearTimeout(retryTimeout);
		}

		if (!RETRYABLE_STATUS.has(res.status)) return res;
	}

	return res;
}

export { DEFAULT_API_TIMEOUT_MS, fetchWithRetry, withTimeout };
