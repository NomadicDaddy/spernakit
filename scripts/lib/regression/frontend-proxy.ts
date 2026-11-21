/**
 * Serve the built frontend for the regression suite, the way nginx does in production.
 *
 * `frontend/dist` (qc's own build output) is served on a loopback port the OS picks, so binding
 * can't race; unknown paths fall back to index.html for the SPA router. `/api` is forwarded to the
 * case's backend and `/ws` is relayed to it. The backend target can change, because a
 * restartBackend step brings the backend up on a fresh port, while the frontend origin the browser
 * and the backend's CORS config know stays the same.
 */
import { existsSync, statSync } from 'node:fs';
import { join, normalize, sep } from 'node:path';

import { REPO_ROOT } from './instance.ts';

export const DIST_DIR = join(REPO_ROOT, 'frontend', 'dist');

export interface FrontendProxy {
	origin: string;
	setBackend: (origin: string) => void;
	stop: () => void;
}

interface Relay {
	/**
	 * The browser's cookie and origin headers. The backend authenticates a WebSocket upgrade from
	 * its auth cookie and checks its origin, so the relayed upgrade must carry both, as nginx's does.
	 */
	headers: Record<string, string>;
	/** What the browser sent before the backend socket opened, sent in order once it does. */
	pending: (ArrayBuffer | string)[];
	/** The browser's path and query, so the backend sees the same socket URL. */
	target: string;
	upstream: null | WebSocket;
}

/**
 * The runtime WebSocket is Bun's, which takes `{ headers }`. With the DOM lib loaded, bun-types
 * defers the global's type to DOM's constructor, whose second argument is only protocols, so
 * this names Bun's own declared signature for the one place that needs headers.
 */
const BunWebSocket = WebSocket as unknown as new (
	url: string,
	options?: Bun.WebSocketOptions,
) => WebSocket;

function distFile(pathname: string): null | string {
	const relative = normalize(decodeURIComponent(pathname)).replace(/^[\\/]+/u, '');
	const file = join(DIST_DIR, relative);
	// Never serve outside dist/, whatever the path says.
	if (file !== DIST_DIR && !file.startsWith(DIST_DIR + sep)) return null;
	return existsSync(file) && statSync(file).isFile() ? file : null;
}

export function startFrontendProxy(): FrontendProxy {
	if (!existsSync(join(DIST_DIR, 'index.html'))) {
		throw new Error(
			'frontend/dist/index.html is missing. The full gate builds it first (step "build").',
		);
	}
	let backend = '';
	const server = Bun.serve<Relay>({
		async fetch(request, srv) {
			const url = new URL(request.url);
			if (url.pathname === '/ws' || url.pathname.startsWith('/ws/')) {
				const headers: Record<string, string> = {};
				for (const name of ['cookie', 'origin']) {
					const value = request.headers.get(name);
					if (value !== null) headers[name] = value;
				}
				const data: Relay = {
					headers,
					pending: [],
					target: `${url.pathname}${url.search}`,
					upstream: null,
				};
				return srv.upgrade(request, { data })
					? undefined
					: new Response('upgrade failed', { status: 400 });
			}
			if (url.pathname.startsWith('/api/') || url.pathname === '/api') {
				const headers = new Headers(request.headers);
				headers.delete('host');
				// fetch decompresses what it receives, so a forwarded content-encoding header would
				// describe bytes that are no longer compressed. Ask the backend for a plain body.
				headers.delete('accept-encoding');
				try {
					return await fetch(`${backend}${url.pathname}${url.search}`, {
						body:
							request.method === 'GET' || request.method === 'HEAD'
								? null
								: await request.arrayBuffer(),
						headers,
						method: request.method,
						redirect: 'manual',
					});
				} catch {
					// The backend is down, as during a restartBackend step: answer as nginx would.
					return new Response('backend unavailable', { status: 502 });
				}
			}
			const file = distFile(url.pathname) ?? join(DIST_DIR, 'index.html');
			return new Response(Bun.file(file));
		},
		hostname: '127.0.0.1',
		port: 0,
		websocket: {
			close(ws) {
				ws.data.upstream?.close();
			},
			message(ws, message) {
				const frame =
					typeof message === 'string' ? message : new Uint8Array(message).buffer;
				const upstream = ws.data.upstream;
				if (upstream?.readyState === WebSocket.OPEN) upstream.send(frame);
				else ws.data.pending.push(frame);
			},
			open(ws) {
				const upstream = new BunWebSocket(
					`${backend.replace(/^http/u, 'ws')}${ws.data.target}`,
					{ headers: ws.data.headers },
				);
				upstream.binaryType = 'arraybuffer';
				ws.data.upstream = upstream;
				upstream.onopen = () => {
					for (const frame of ws.data.pending.splice(0)) upstream.send(frame);
				};
				upstream.onmessage = (event) => ws.send(event.data as ArrayBuffer | string);
				upstream.onclose = () => ws.close();
			},
		},
	});
	return {
		origin: `http://127.0.0.1:${String(server.port)}`,
		setBackend: (origin) => {
			backend = origin;
		},
		stop: () => {
			void server.stop(true);
		},
	};
}
