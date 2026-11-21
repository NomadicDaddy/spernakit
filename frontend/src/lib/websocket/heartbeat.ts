import { PING_INTERVAL, PONG_TIMEOUT } from './constants';

/**
 * Owns the heartbeat timers for the WebSocket manager: a ping every PING_INTERVAL while the socket
 * is open, and a pong deadline that closes the socket if no pong arrives within PONG_TIMEOUT. The
 * socket is read through a getter at the moment each timer fires, so a reconnect that replaces the
 * socket never leaves a timer holding the old one.
 */
class Heartbeat {
	private pingInterval: null | ReturnType<typeof setInterval> = null;
	private pongTimeout: null | ReturnType<typeof setTimeout> = null;

	private readonly getSocket: () => null | WebSocket;

	constructor(getSocket: () => null | WebSocket) {
		this.getSocket = getSocket;
	}

	/** Start pinging every PING_INTERVAL. The caller clears any earlier timers first. */
	public start(): void {
		this.pingInterval = setInterval(() => {
			this.sendPing();
		}, PING_INTERVAL);
	}

	/** Send one ping now, unless the socket isn't open or a ping is already awaiting its pong. */
	public sendPing(): void {
		const socket = this.getSocket();
		if (socket === null || socket.readyState !== socket.OPEN) return;
		if (this.pongTimeout) return;

		try {
			socket.send(JSON.stringify({ type: 'ping' }));
		} catch {
			socket.close();
			return;
		}

		this.pongTimeout = setTimeout(() => this.getSocket()?.close(), PONG_TIMEOUT);
	}

	/** A pong arrived: cancel the deadline so the socket stays open. */
	public pongReceived(): void {
		if (this.pongTimeout) {
			clearTimeout(this.pongTimeout);
			this.pongTimeout = null;
		}
	}

	public clear(): void {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}
		this.pongReceived();
	}
}

export { Heartbeat };
