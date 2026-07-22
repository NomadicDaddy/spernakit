/**
 * Build the WebSocket URL from the current page location.
 * In development, connect directly to the backend to avoid Vite proxy noise
 * when browser tabs reconnect while the dev servers are stopping or starting.
 */
function getWsUrl(): string {
	const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	if (import.meta.env.DEV) {
		return `${protocol}//${window.location.hostname}:${__BACKEND_PORT__}/ws`;
	}
	return `${protocol}//${window.location.host}/ws`;
}

function getBackendHealthUrl(): string {
	if (import.meta.env.DEV) {
		return `${window.location.protocol}//${window.location.hostname}:${__BACKEND_PORT__}/api/v1/health`;
	}
	return '/api/v1/health';
}

export { getBackendHealthUrl, getWsUrl };
