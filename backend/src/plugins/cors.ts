import { Elysia } from 'elysia';

import { getConfig } from '../config/configLoader.ts';
import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { appendVaryToken } from '../utils/headerUtils.ts';
import { isOriginAllowed } from '../utils/originValidation.ts';

/** CORS preflight cache: 24 hours in seconds (24 * 60 * 60) */
const CORS_MAX_AGE_SECONDS = 86_400;

function setCorsHeaders(request: Request, headers: Record<string, number | string>): void {
	const config = getConfig();
	const origin = request.headers.get('origin');

	appendVaryToken(headers, 'Origin');

	if (origin && isOriginAllowed(origin, config)) {
		headers['Access-Control-Allow-Origin'] = origin;
		headers['Access-Control-Allow-Credentials'] = 'true';
		headers['Access-Control-Expose-Headers'] = 'X-CSRF-Token, X-Request-ID';
	}
}

/**
 * Elysia plugin that handles CORS (Cross-Origin Resource Sharing).
 * Uses config.cors settings to determine allowed origins.
 */
const corsPlugin = new Elysia({ name: 'cors' })
	.onRequest(({ request, set }): string | void => {
		// Handle preflight OPTIONS requests
		if (request.method === 'OPTIONS') {
			const config = getConfig();
			const origin = request.headers.get('origin');

			if (origin && isOriginAllowed(origin, config)) {
				set.headers['Access-Control-Allow-Origin'] = origin;
				set.headers['Access-Control-Allow-Methods'] =
					'GET, POST, PUT, DELETE, PATCH, OPTIONS';
				set.headers['Access-Control-Allow-Headers'] =
					'Content-Type, Authorization, X-Requested-With, X-CSRF-Token, X-API-Key, X-API-Signature, X-API-Timestamp, X-API-Nonce, X-Request-ID, X-Session-ID, X-Workspace-ID';
				set.headers['Access-Control-Expose-Headers'] = 'X-CSRF-Token, X-Request-ID';
				set.headers['Access-Control-Allow-Credentials'] = 'true';
				set.headers['Access-Control-Max-Age'] = String(CORS_MAX_AGE_SECONDS);
				appendVaryToken(set.headers, 'Origin');
				set.status = HTTP_STATUS.NO_CONTENT;
				return '';
			}
		}
		// Continue request chain for non-OPTIONS requests
	})
	.onAfterHandle({ as: 'scoped' }, ({ request, set }) => {
		setCorsHeaders(request, set.headers);
	})
	.onError({ as: 'scoped' }, ({ request, set }) => {
		setCorsHeaders(request, set.headers);
	});

export { corsPlugin };
