/**
 * Interval between ping messages (ms).
 * WebSocket connections can appear open even when the underlying TCP connection
 * has died (e.g., network switch, server crash). Regular pings ensure we detect
 * dead connections quickly. 25 seconds is chosen to be well under typical load
 * balancer idle timeouts (30-60 seconds).
 */
const PING_INTERVAL = 25_000;

/**
 * Max wait for pong before considering connection dead (ms).
 * If the server doesn't respond to a ping within 10 seconds, we assume the
 * connection is dead and close it to trigger reconnection. This is faster than
 * waiting for TCP timeout which can take minutes.
 */
const PONG_TIMEOUT = 10_000;

/**
 * Base delay for reconnection backoff (ms).
 * Exponential backoff prevents thundering herd when server comes back online
 * after an outage. Starting at 1 second gives the server time to recover.
 */
const BASE_RECONNECT_DELAY = 1000;

/**
 * Maximum reconnection delay (ms).
 * Capping at 30 seconds prevents excessively long waits during extended outages
 * while still providing meaningful backoff.
 */
const MAX_RECONNECT_DELAY = 30_000;

/**
 * Maximum reconnection attempts before stopping.
 * After 20 attempts with exponential backoff (1s, 2s, 4s, ... 30s), we've tried
 * for approximately 4-5 minutes. Beyond this, manual intervention is likely needed.
 */
const MAX_RECONNECT_ATTEMPTS = 20;

export {
	BASE_RECONNECT_DELAY,
	MAX_RECONNECT_ATTEMPTS,
	MAX_RECONNECT_DELAY,
	PING_INTERVAL,
	PONG_TIMEOUT,
};
