import { z } from 'zod';

export const websocketSchema = z.object({
	maxConnectionsPerIp: z.number().int(),
	maxConnectionsPerUser: z.number().int(),
	// Default MUST match WS_MAX_PAYLOAD_BYTES in constants/websocket.ts — Elysia
	// evaluates ws() at import time before config init. Validated at startup.
	maxPayload: z.number().int(),
	rateLimitWindow: z.number().int(),
});
