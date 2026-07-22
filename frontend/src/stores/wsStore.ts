import { create } from 'zustand';

/** Current state of the WebSocket connection lifecycle. */
type WsConnectionState = 'connected' | 'connecting' | 'disconnected';

/** Callback invoked when a message arrives on a subscribed channel. */
type WsMessageHandler = (data: unknown) => void;

/**
 * Global WebSocket state store.
 *
 * Manages the connection lifecycle and a channel-based pub/sub registry
 * so components can subscribe to specific message types.
 */
interface WsState {
	connectionState: WsConnectionState;
	handlers: Map<string, Set<WsMessageHandler>>;
	setConnectionState: (state: WsConnectionState) => void;
	subscribe: (channel: string, handler: WsMessageHandler) => void;
	unsubscribe: (channel: string, handler: WsMessageHandler) => void;
}

const useWsStore = create<WsState>()((set, get) => ({
	connectionState: 'disconnected',

	handlers: new Map<string, Set<WsMessageHandler>>(),

	setConnectionState: (connectionState: WsConnectionState) => {
		set({ connectionState });
	},

	subscribe: (channel: string, handler: WsMessageHandler) => {
		const handlers = new Map(get().handlers);
		let channelHandlers = handlers.get(channel);
		if (!channelHandlers) {
			channelHandlers = new Set<WsMessageHandler>();
		} else {
			channelHandlers = new Set(channelHandlers);
		}
		channelHandlers.add(handler);
		handlers.set(channel, channelHandlers);
		set({ handlers });
	},

	unsubscribe: (channel: string, handler: WsMessageHandler) => {
		const handlers = new Map(get().handlers);
		const channelHandlers = handlers.get(channel);
		if (channelHandlers) {
			const newChannelHandlers = new Set(channelHandlers);
			newChannelHandlers.delete(handler);
			if (newChannelHandlers.size === 0) {
				handlers.delete(channel);
			} else {
				handlers.set(channel, newChannelHandlers);
			}
			set({ handlers });
		}
	},
}));

export { useWsStore };
export type { WsMessageHandler };
