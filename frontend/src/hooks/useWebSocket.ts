import { useEffect, useRef } from 'react';

import { WebSocketManager } from '@/lib/websocket';
import { useAuthStore } from '@/stores/authStore';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { useWsStore } from '@/stores/wsStore';

function useWebSocket(): void {
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const activeWorkspaceId = useWorkspaceStore((s) => s.activeWorkspaceId);
	const connectionState = useWsStore((s) => s.connectionState);
	const setConnectionState = useWsStore((s) => s.setConnectionState);

	const managerRef = useRef<null | WebSocketManager>(null);

	if (managerRef.current === null) {
		managerRef.current = WebSocketManager.getInstance();
	}

	useEffect(() => {
		const manager = managerRef.current;
		if (!manager) return;

		if (isAuthenticated) {
			manager.subscribe(setConnectionState);
			manager.connect();
		}

		return () => {
			manager.unsubscribe();
		};
	}, [isAuthenticated, setConnectionState]);

	useEffect(() => {
		const manager = managerRef.current;
		if (
			!manager ||
			!isAuthenticated ||
			connectionState !== 'connected' ||
			activeWorkspaceId === null
		) {
			return;
		}

		const channel = `workspace:${activeWorkspaceId}`;
		manager.subscribeChannel(channel);

		return () => {
			manager.unsubscribeChannel(channel);
		};
	}, [activeWorkspaceId, connectionState, isAuthenticated]);
}

export { useWebSocket };
