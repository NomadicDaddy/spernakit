interface WsMessage {
	channel?: string;
	data?: unknown;
	type: string;
}

export type { WsMessage };
