import { Type } from '../configSchemaHelpers';

export const websocketSchema = Type.Object({
	maxConnectionsPerIp: Type.Integer(),
	maxConnectionsPerUser: Type.Integer(),
	// Default MUST match WS_MAX_PAYLOAD_BYTES in constants/websocket.ts — Elysia
	// evaluates ws() at import time before config init. Validated at startup.
	maxPayload: Type.Integer(),
	rateLimitWindow: Type.Integer(),
});
