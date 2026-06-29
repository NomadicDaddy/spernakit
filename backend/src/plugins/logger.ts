import { Elysia } from 'elysia';

import { incrementRequestCount } from '../services/metricsService.ts';
import { logApi } from '../utils/logger.ts';
import { requestIdPlugin } from './requestId.ts';

/**
 * Per-request start times keyed by the Request object (same pattern as clientIp).
 * Global app state would be overwritten by concurrent requests, corrupting durations.
 */
const requestStartTimes = new WeakMap<Request, number>();

const loggerPlugin = new Elysia({ name: 'logger' })
	.use(requestIdPlugin)
	.onRequest(({ request }) => {
		requestStartTimes.set(request, Date.now());
		incrementRequestCount();
	})
	.onAfterResponse(({ request, requestId, sessionId, set }) => {
		const url = new URL(request.url);
		const start = requestStartTimes.get(request);
		const duration = start === undefined ? undefined : Date.now() - start;
		const status = typeof set.status === 'number' ? set.status : 200;

		const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';

		logApi(level, `${request.method} ${url.pathname}`, {
			duration,
			method: request.method,
			path: url.pathname,
			requestId,
			sessionId,
			status,
		});
	})
	.onError(({ error, request, requestId, sessionId, set }) => {
		const url = new URL(request.url);
		const status = typeof set.status === 'number' ? set.status : 500;
		const isError = error instanceof Error;

		logApi('error', `${request.method} ${url.pathname} unhandled error`, {
			error: isError ? error.message : String(error),
			method: request.method,
			path: url.pathname,
			requestId,
			sessionId,
			...(isError && error.stack ? { stack: error.stack } : {}),
			status,
		});
	});

export { loggerPlugin };
