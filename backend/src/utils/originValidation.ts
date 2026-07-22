import type { getConfig } from '../config/configLoader.ts';

import { logger } from './logger.ts';

/** Pattern matching any http(s) origin with a host and optional port capture groups. */
const ORIGIN_HOST_PORT_PATTERN = /^https?:\/\/([^/:]+)(?::(\d+))?$/;
/** Pattern matching localhost/127.0.0.1 with a port capture group for development origin checks. */
const LOCALHOST_ORIGIN_PATTERN = /^https?:\/\/(?:localhost|127\.0\.0\.1):(\d+)$/;

/**
 * Check whether the given origin's host and port match the backend's own listen address.
 * Supports single-port deployments where the frontend is served from the same origin as
 * the backend, so the browser's Origin header matches the backend port rather than the
 * statically configured frontendUrl.
 *
 * @param origin - The Origin header value to compare against the backend listen address
 * @param config - Application config (reads server.backendPort and server.host)
 * @returns true if the origin's host+port matches the backend listen address
 */
function isBackendSameOrigin(origin: string, config: ReturnType<typeof getConfig>): boolean {
	const match = ORIGIN_HOST_PORT_PATTERN.exec(origin);
	if (!match) return false;
	const host = match[1];
	const port = match[2];
	if (!host || port === undefined) return false;
	if (port !== String(config.server.backendPort)) return false;
	// Accept any host the backend could be reached on (localhost, 127.0.0.1, configured host).
	const acceptedHosts = new Set(['localhost', '127.0.0.1']);
	if (config.server.host && config.server.host !== '0.0.0.0') {
		acceptedHosts.add(config.server.host);
	}
	return acceptedHosts.has(host);
}

/**
 * Check if the given origin is allowed by CORS config.
 * Used by both the CORS plugin and WebSocket upgrade validation.
 *
 * @param origin - The Origin header value
 * @param config - Application config
 * @returns true if origin is allowed
 */
function isOriginAllowed(origin: null | string, config: ReturnType<typeof getConfig>): boolean {
	if (!origin) {
		return config.cors.allowNoOrigin;
	}

	// Same-origin: the browser Origin equals the configured frontendUrl. Allowed
	// unconditionally (independent of nodeEnv) so production deployments with a
	// correctly configured frontendUrl pass without needing allowedOrigins.
	if (origin === config.server.frontendUrl) {
		return true;
	}

	// Single-port deployments: frontend served from the backend's own listen address.
	if (isBackendSameOrigin(origin, config)) {
		return true;
	}

	if (
		config.server.nodeEnv === 'development' &&
		config.cors.frontendDevOrigins.includes(origin)
	) {
		return true;
	}

	if (config.cors.allowedOrigins.includes(origin)) {
		return true;
	}

	if (config.server.nodeEnv === 'development') {
		const match = LOCALHOST_ORIGIN_PATTERN.exec(origin);
		const port = match?.[1];
		if (port !== undefined) {
			const devPorts = new Set([
				String(config.server.frontendPort),
				String(config.server.backendPort),
				'5173',
			]);
			if (devPorts.has(port)) {
				return true;
			}
		}
	}

	// When behind a reverse proxy, require explicit allowedOrigins configuration.
	// Log a warning if trustProxy is enabled but no origins are configured.
	if (config.server.trustProxy && config.cors.allowedOrigins.length === 0) {
		logger.warn(
			{ category: 'security', origin },
			'CORS: trustProxy is enabled but cors.allowedOrigins is empty. Configure allowed origins explicitly.'
		);
	}

	logger.warn(
		{
			allowedOrigins: config.cors.allowedOrigins,
			category: 'security',
			frontendUrl: config.server.frontendUrl,
			origin,
		},
		'CORS: origin rejected'
	);

	return false;
}

export { isOriginAllowed };
