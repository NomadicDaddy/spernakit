import { useWsStore } from '@/stores/wsStore';

import type { WsMessage } from './types';

function dispatchToHandlers(msg: WsMessage): void {
	const currentHandlers = useWsStore.getState().handlers;

	if (msg.channel) {
		const channelHandlers = currentHandlers.get(msg.channel);
		if (channelHandlers) {
			for (const handler of channelHandlers) {
				try {
					handler(msg.data);
				} catch (err) {
					if (import.meta.env.DEV) console.error('[WS] Handler error:', err);
				}
			}
		}
	}

	const wildcardHandlers = currentHandlers.get('*');
	if (wildcardHandlers) {
		for (const handler of wildcardHandlers) {
			try {
				handler(msg);
			} catch (err) {
				// Handler errors should not break the WebSocket; surface them in DEV only.
				if (import.meta.env.DEV) console.error('[WS] Wildcard handler error:', err);
			}
		}
	}
}

export { dispatchToHandlers };
