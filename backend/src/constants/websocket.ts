/**
 * Hardcoded WebSocket max payload size (1 MB).
 *
 * Elysia framework limitation: ws() config is evaluated at module import time,
 * before the application config is initialized. This constant is the single
 * source of truth for the Bun transport-level limit. The runtime config value
 * (config.websocket.maxPayload) MUST match this constant — validated at startup
 * by validateWsMaxPayload().
 */
const WS_MAX_PAYLOAD_BYTES = 1_048_576;

export { WS_MAX_PAYLOAD_BYTES };
