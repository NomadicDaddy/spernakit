import { Elysia } from 'elysia';

import { captureClientIp } from '../utils/clientIp.ts';
import { getBunServer } from '../utils/serverRef.ts';

/**
 * Elysia plugin that captures the client IP for every incoming request and
 * stashes it in a WeakMap keyed by the Request object. Later lifecycle hooks
 * (notably the audit plugin's `onAfterResponse`) can then retrieve the IP
 * without re-calling `server.requestIP(request)` — which by that point
 * returns `null` because Bun has released the request→socket mapping.
 *
 * Must be registered FIRST in the plugin chain, before any plugin that may
 * want to read the client IP. `onRequest` is the only hook where
 * `server.requestIP(request)` reliably yields the socket address for browser
 * traffic.
 */
const clientIpPlugin = new Elysia({ name: 'clientIp' }).onRequest(({ request }) => {
	captureClientIp(getBunServer(), request);
});

export { clientIpPlugin };
