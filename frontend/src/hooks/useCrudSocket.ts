import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { WS_CRUD_EVENTS } from 'spernakit-shared';

import type { WsMessageHandler } from '@/stores/wsStore';

import { useAuthStore } from '@/stores/authStore';
import { useWsStore } from '@/stores/wsStore';

/**
 * Map of WebSocket CRUD event types to the TanStack Query key prefixes they invalidate.
 *
 * When the server broadcasts a CRUD event (e.g., `user-created`), this map determines
 * which query caches should be invalidated so other connected clients see fresh data.
 */
const CRUD_EVENT_INVALIDATION_MAP: Record<string, readonly string[]> = {
	[WS_CRUD_EVENTS.DASHBOARD_CREATED]: ['dashboards'],
	[WS_CRUD_EVENTS.DASHBOARD_DELETED]: ['dashboards'],
	[WS_CRUD_EVENTS.DASHBOARD_UPDATED]: ['dashboards'],
	[WS_CRUD_EVENTS.FILE_CREATED]: ['files'],
	[WS_CRUD_EVENTS.FILE_DELETED]: ['files'],
	[WS_CRUD_EVENTS.HEALTH_ALERT_UPDATED]: ['health-alerts'],
	[WS_CRUD_EVENTS.HEALTH_CONFIG_UPDATED]: ['health-config'],
	[WS_CRUD_EVENTS.SETTING_UPDATED]: ['settings'],
	[WS_CRUD_EVENTS.USER_CREATED]: ['users'],
	[WS_CRUD_EVENTS.USER_DELETED]: ['users'],
	[WS_CRUD_EVENTS.USER_UPDATED]: ['users'],
	[WS_CRUD_EVENTS.WORKSPACE_CREATED]: ['workspaces'],
	[WS_CRUD_EVENTS.WORKSPACE_DELETED]: ['workspaces'],
	[WS_CRUD_EVENTS.WORKSPACE_MEMBER_CREATED]: ['workspace-members'],
	[WS_CRUD_EVENTS.WORKSPACE_MEMBER_DELETED]: ['workspace-members'],
	[WS_CRUD_EVENTS.WORKSPACE_MEMBER_UPDATED]: ['workspace-members'],
	[WS_CRUD_EVENTS.WORKSPACE_UPDATED]: ['workspaces'],
};

interface CrudWsMessage {
	data: unknown;
	type: string;
}

/**
 * Listens for real-time CRUD event broadcasts on the WebSocket wildcard channel.
 *
 * When another user (or the current user from a different tab) modifies shared data,
 * the server broadcasts a typed event. This hook invalidates the relevant TanStack
 * Query caches so the UI refreshes without requiring manual page reload or waiting
 * for the 5-minute stale-time fallback.
 *
 * Should be called once in AppShell so it runs globally when authenticated.
 */
function useCrudSocket(): void {
	const queryClient = useQueryClient();
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const subscribe = useWsStore((s) => s.subscribe);
	const unsubscribe = useWsStore((s) => s.unsubscribe);
	const connectionState = useWsStore((s) => s.connectionState);

	useEffect(() => {
		if (!isAuthenticated || connectionState !== 'connected') return;

		const handler: WsMessageHandler = (message) => {
			const wsMessage = message as CrudWsMessage;
			const queryKeys = CRUD_EVENT_INVALIDATION_MAP[wsMessage.type];
			if (!queryKeys) return;

			for (const key of queryKeys) {
				void queryClient.invalidateQueries({ queryKey: [key] });
			}
		};

		subscribe('*', handler);

		return () => {
			unsubscribe('*', handler);
		};
	}, [isAuthenticated, connectionState, subscribe, unsubscribe, queryClient]);
}

export { useCrudSocket };
