import { BASE_RECONNECT_DELAY, MAX_RECONNECT_ATTEMPTS, MAX_RECONNECT_DELAY } from './constants';
import { getBackendHealthUrl } from './utils';

const BACKEND_HEALTH_TIMEOUT_MS = 1500;
const BACKEND_LIVENESS_RETRY_DELAY_MS = 30_000;

/**
 * Probe the backend health endpoint to confirm it is reachable before
 * attempting a WebSocket connection.
 */
async function checkBackendReachable(): Promise<boolean> {
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), BACKEND_HEALTH_TIMEOUT_MS);

	try {
		const res = await fetch(getBackendHealthUrl(), {
			cache: 'no-store',
			signal: controller.signal,
		});
		return res.ok;
	} catch {
		return false;
	} finally {
		clearTimeout(timeout);
	}
}

/**
 * Owns the reconnect/backoff and backend-liveness-probe timers for the
 * WebSocket manager. Exponential backoff is applied per attempt up to
 * MAX_RECONNECT_ATTEMPTS; after exhaustion, a slow liveness probe loop
 * takes over until the backend is reachable again.
 */
class ReconnectScheduler {
	private reconnectTimeout: null | ReturnType<typeof setTimeout> = null;
	private livenessProbeTimeout: null | ReturnType<typeof setTimeout> = null;
	private reconnectAttempts = 0;

	private readonly onReconnectAttempt: () => void;
	private readonly onLivenessProbe: () => void;

	constructor(onReconnectAttempt: () => void, onLivenessProbe: () => void) {
		this.onReconnectAttempt = onReconnectAttempt;
		this.onLivenessProbe = onLivenessProbe;
	}

	public resetAttempts(): void {
		this.reconnectAttempts = 0;
	}

	public scheduleAttempt(): void {
		if (this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
			this.scheduleLivenessProbe();
			return;
		}

		const delay = Math.min(
			BASE_RECONNECT_DELAY * Math.pow(2, this.reconnectAttempts),
			MAX_RECONNECT_DELAY
		);
		this.reconnectAttempts++;

		this.reconnectTimeout = setTimeout(() => {
			this.onReconnectAttempt();
		}, delay);
	}

	public scheduleLivenessProbe(): void {
		if (this.livenessProbeTimeout) return;

		this.livenessProbeTimeout = setTimeout(() => {
			this.livenessProbeTimeout = null;
			this.onLivenessProbe();
		}, BACKEND_LIVENESS_RETRY_DELAY_MS);
	}

	public clearTimers(): void {
		if (this.reconnectTimeout) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}
		if (this.livenessProbeTimeout) {
			clearTimeout(this.livenessProbeTimeout);
			this.livenessProbeTimeout = null;
		}
	}
}

export { checkBackendReachable, ReconnectScheduler };
