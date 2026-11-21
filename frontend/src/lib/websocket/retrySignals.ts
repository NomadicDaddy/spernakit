/**
 * The browser signals that should make the WebSocket manager check its connection at once rather
 * than wait for its backoff timer: the tab becoming visible again, and the network coming back.
 */
type RetrySignalHandler = (event?: Event) => void;

/** True for a visibilitychange to visible, or an online event. */
function isRetrySignal(event?: Event): boolean {
	const isVisibleSignal =
		event?.type === 'visibilitychange' && document.visibilityState === 'visible';
	const isOnlineSignal = event?.type === 'online';
	return isVisibleSignal || isOnlineSignal;
}

function addRetrySignalListeners(handler: RetrySignalHandler): void {
	document.addEventListener('visibilitychange', handler);
	window.addEventListener('online', handler);
}

function removeRetrySignalListeners(handler: RetrySignalHandler): void {
	document.removeEventListener('visibilitychange', handler);
	window.removeEventListener('online', handler);
}

export { addRetrySignalListeners, isRetrySignal, removeRetrySignalListeners };
export type { RetrySignalHandler };
