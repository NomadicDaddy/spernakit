import { Elysia } from 'elysia';

const REQUEST_ID_HEADER = 'X-Request-ID';
const SESSION_ID_HEADER = 'X-Session-ID';

/** Max length and allowed characters for client-supplied correlation IDs. */
const VALID_ID_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;

/**
 * Generate a new request ID using Bun's native crypto.randomUUID().
 *
 * @returns A new UUID v4 string
 */
function generateRequestId(): string {
	return crypto.randomUUID();
}

/**
 * Elysia plugin that extracts or generates request and session IDs for tracing.
 *
 * - Extracts X-Request-ID from incoming request headers if present
 * - Generates a new UUID v4 if not provided by client
 * - Extracts X-Session-ID from incoming request headers (frontend-generated, sessionStorage-persisted)
 * - Propagates requestId and sessionId via scoped derive for type-safe access by other plugins
 * - Echoes both headers back in response
 */
const requestIdPlugin = new Elysia({ name: 'requestId' })
	.derive({ as: 'scoped' }, ({ request }) => {
		const existingId = request.headers.get(REQUEST_ID_HEADER);
		const requestId =
			existingId && VALID_ID_PATTERN.test(existingId) ? existingId : generateRequestId();
		const rawSessionId = request.headers.get(SESSION_ID_HEADER);
		const sessionId =
			rawSessionId && VALID_ID_PATTERN.test(rawSessionId) ? rawSessionId : undefined;

		return { requestId, sessionId };
	})
	.onAfterResponse(({ requestId, sessionId, set }) => {
		if (requestId) {
			set.headers[REQUEST_ID_HEADER] = requestId;
		}
		if (sessionId) {
			set.headers[SESSION_ID_HEADER] = sessionId;
		}
	});

export { requestIdPlugin };
