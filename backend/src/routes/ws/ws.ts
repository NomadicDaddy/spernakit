import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { WS_MAX_PAYLOAD_BYTES } from '../../constants/websocket.ts';
import { setBunServer } from '../../services/websocketService.ts';
import { logger } from '../../utils/logger.ts';
import { handleClose, handleMessage, handleOpen, handleUpgrade } from './wsHandlers.ts';

/**
 * Elysia WebSocket route at /ws with cookie-based authentication.
 *
 * On upgrade, JWT is validated from cookie header.
 * Authenticated users are auto-subscribed to their user:{userId} channel.
 * Channel subscriptions use Bun's native topic-based pub/sub.
 */
const wsRoutes = new Elysia({ name: 'ws' }).ws('/ws', {
	close(ws) {
		handleClose(ws);
	},

	// Enforce max payload at the Bun transport level to reject oversized messages
	// before they are fully buffered in memory. Hardcoded because ws() is evaluated
	// at module import time before config initialization. Validated against
	// config.websocket.maxPayload at startup via validateWsMaxPayload().
	maxPayloadLength: WS_MAX_PAYLOAD_BYTES,

	message(ws, rawMessage) {
		handleMessage(ws, rawMessage as string);
	},

	open(ws) {
		handleOpen(ws);
	},

	upgrade(context) {
		const upgradeContext = handleUpgrade({ request: context.request, set: context.set });
		if (typeof upgradeContext !== 'string') {
			// Elysia ignores the upgrade hook's return value and spreads the mutated
			// request context into ws.data. Attach the authenticated context explicitly.
			Object.assign(context, upgradeContext);
		}
	},
});

/**
 * Validate that the hardcoded WS max payload matches the config value.
 * Call after config initialization to detect mismatches.
 */
function validateWsMaxPayload(): void {
	const configMaxPayload = getConfig().websocket.maxPayload;
	if (configMaxPayload !== WS_MAX_PAYLOAD_BYTES) {
		logger.error(
			{ configValue: configMaxPayload, hardcoded: WS_MAX_PAYLOAD_BYTES },
			'WebSocket maxPayload config mismatch: config.websocket.maxPayload differs from ' +
				'the hardcoded transport limit. Update WS_MAX_PAYLOAD_BYTES in constants/websocket.ts to match.'
		);
	}
}

export { setBunServer, validateWsMaxPayload, wsRoutes };
