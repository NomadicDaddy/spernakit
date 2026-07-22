import type { getConfig } from '../../config/configLoader.ts';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
// Imported from wsBroadcast directly: getConnectionCountsByIp is rate-limit
// internal and not part of the websocketService facade's public API.
import {
	getConnectionCountsByIp,
	getConnectionCountsByUser,
} from '../../services/websocket/wsBroadcast.ts';
import { logger } from '../../utils/logger.ts';
import { LOOPBACK_IPS } from '../../utils/loopback.ts';

/**
 * Check per-IP and per-user connection limits for WebSocket upgrade.
 *
 * Both limits are derived from the actual tracked connections map (clientIp is
 * stored on each TrackedConnection) to prevent counter drift when connections
 * abort between upgrade and open (e.g., Vite proxy ECONNABORTED).
 *
 * @param clientIp - Client IP address
 * @param userId - Authenticated user ID
 * @param config - Application config
 * @param set - Elysia response setter
 * @returns Error message string if limit exceeded, undefined if OK
 */
function checkConnectionLimits(
	clientIp: string,
	userId: number,
	config: ReturnType<typeof getConfig>,
	set: { status?: number | string }
): string | undefined {
	// Loopback addresses are exempt from per-IP limits only when NOT behind a reverse proxy.
	// When trustProxy is enabled, loopback is the proxy address, not the real client —
	// getClientIp resolves the real IP, so loopback exemption would bypass rate limiting.
	const isLoopback = !config.server.trustProxy && LOOPBACK_IPS.has(clientIp);
	if (!isLoopback) {
		const ipCounts = getConnectionCountsByIp();
		const currentIpConnections = (ipCounts.get(clientIp) ?? 0) + 1;
		if (currentIpConnections > config.websocket.maxConnectionsPerIp) {
			logger.warn(
				{
					clientIp,
					connectionCount: currentIpConnections,
					limit: config.websocket.maxConnectionsPerIp,
				},
				'WebSocket upgrade rejected: IP connection limit exceeded'
			);
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			return 'Too many connections from this IP';
		}
	}

	const actualCounts = getConnectionCountsByUser();
	const currentUserConnections = (actualCounts.get(userId) ?? 0) + 1;
	if (currentUserConnections > config.websocket.maxConnectionsPerUser) {
		logger.warn(
			{
				connectionCount: currentUserConnections,
				limit: config.websocket.maxConnectionsPerUser,
				userId,
			},
			'WebSocket upgrade rejected: per-user connection limit exceeded'
		);
		set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
		return 'Too many connections for this user';
	}

	return undefined;
}

export { checkConnectionLimits };
