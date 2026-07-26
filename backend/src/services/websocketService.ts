/**
 * WebSocket Service — Facade.
 *
 * Re-exports public API from the websocket/ subdirectory.
 * No business logic belongs in this file.
 */
export {
	broadcastCrudToAdmins,
	broadcastCrudToUser,
	broadcastCrudToWorkspace,
	broadcastDashboardUpdate,
	broadcastToUser,
	cleanupConnection,
	closeAllConnections,
	getConnection,
	getConnectionCount,
	registerConnection,
	setBunServer,
} from './websocket/wsBroadcast.ts';
export type { TrackedConnection } from './websocket/wsBroadcast.ts';
export {
	handleSubscribe,
	handleUnsubscribe,
	nextConnectionId,
	preprocessMessage,
	WS_MESSAGE_TYPES,
} from './websocket/wsHelpers.ts';
