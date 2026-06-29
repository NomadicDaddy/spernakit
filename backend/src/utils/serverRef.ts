import type { Server } from 'bun';

/** Shared reference to the Bun server instance, set once after .listen() in app.ts. */
let bunServer: null | Server<unknown> = null;

/**
 * Store the Bun server reference for use by utilities that need socket-level APIs.
 * Must be called after Elysia's .listen() in app.ts.
 * @param server
 */
export function setBunServer(server: Server<unknown>): void {
	bunServer = server;
}

/**
 * Get the stored Bun server reference, or null if not yet initialized.
 * @returns The Bun server instance, or null if not yet set
 */
export function getBunServer(): null | Server<unknown> {
	return bunServer;
}
