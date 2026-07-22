import type { Server } from 'bun';

import { BlockList, isIP } from 'node:net';

import { getConfig } from '../config/configLoader.ts';
import { logger } from './logger.ts';
import { getBunServer } from './serverRef.ts';

/**
 * Per-request IP cache keyed by the Request object identity.
 *
 * Bun cannot reliably resolve `server.requestIP(request)` by the time Elysia
 * reaches `onAfterResponse`, where the audit plugin runs. Resolve the address
 * during `onRequest` and cache it by Request identity for later hooks.
 *
 * The cache is populated by `captureClientIp(server, request)` at the start
 * of every request, then read by `getClientIp(request)` later in the
 * pipeline. The WeakMap auto-cleans when the Request is garbage-collected
 * (end of request), so there is no leak or TTL bookkeeping.
 */
const clientIpByRequest = new WeakMap<Request, string>();

/**
 * Resolve and cache the client IP for a request. MUST be called from Elysia's
 * `onRequest` hook (not `onBeforeHandle` / `derive` / `onAfterResponse`) —
 * only at that lifecycle stage does `server.requestIP(request)` reliably
 * return a non-null SocketAddress for browser traffic.
 *
 * Safe to call multiple times on the same request — the WeakMap is
 * idempotent and the later call simply overwrites the earlier value with the
 * same data.
 *
 * @param server - The Bun server reference (from getBunServer()).
 * @param request - The incoming Request object.
 */
function captureClientIp(server: null | Server<unknown>, request: Request): void {
	if (!server) return;

	// Resolve the direct socket peer first. This is where we have to use the
	// ORIGINAL request reference — Bun's requestIP() matches by identity.
	let socketIp: string | undefined;
	try {
		const addr = server.requestIP(request);
		if (addr) {
			const ip = sanitizeIpAddress(addr.address);
			if (isValidIpAddress(ip)) {
				socketIp = ip;
			}
		}
	} catch (err) {
		logger.debug(
			{ err: err instanceof Error ? err.message : String(err) },
			'captureClientIp: server.requestIP threw'
		);
	}

	const config = getConfig();
	const { trustedProxies, trustProxy } = config.server;
	// Only honor forwarded headers when the DIRECT peer is itself a trusted
	// proxy — otherwise any client connecting straight to the server could
	// spoof X-Forwarded-For/X-Real-IP while trustProxy is enabled.
	if (
		trustProxy &&
		trustedProxies.length > 0 &&
		socketIp &&
		isTrustedProxy(socketIp, trustedProxies)
	) {
		const forwardedIp = getClientIpFromForwardedHeader(request, trustedProxies);
		if (forwardedIp) {
			clientIpByRequest.set(request, forwardedIp);
			return;
		}
		const realIp = getClientIpFromRealIpHeader(request);
		if (realIp) {
			clientIpByRequest.set(request, realIp);
			return;
		}
	}

	if (socketIp) {
		clientIpByRequest.set(request, socketIp);
	}
}

let cachedBlockList: BlockList | null = null;
let cachedProxiesKey = '';

function buildTrustedProxyBlockList(trustedProxies: string[]): BlockList {
	const key = trustedProxies.join(',');
	if (cachedBlockList && cachedProxiesKey === key) return cachedBlockList;

	const blockList = new BlockList();
	for (const entry of trustedProxies) {
		if (entry.includes('/')) {
			const [addr, prefixStr] = entry.split('/');
			const prefix = Number.parseInt(prefixStr!, 10);
			if (addr && !Number.isNaN(prefix)) {
				const type = isIP(addr) === 6 ? 'ipv6' : 'ipv4';
				blockList.addSubnet(addr, prefix, type);
			}
		} else if (isIP(entry)) {
			const type = isIP(entry) === 6 ? 'ipv6' : 'ipv4';
			blockList.addAddress(entry, type);
		}
	}

	cachedBlockList = blockList;
	cachedProxiesKey = key;
	return blockList;
}

function isTrustedProxy(ip: string, trustedProxies: string[]): boolean {
	if (trustedProxies.length === 0) return false;
	const blockList = buildTrustedProxyBlockList(trustedProxies);
	const type = isIP(ip) === 6 ? 'ipv6' : 'ipv4';
	return blockList.check(ip, type);
}

function isValidIpAddress(ip: string): boolean {
	if (!ip) return false;
	return isIP(ip) !== 0;
}

function sanitizeIpAddress(ip: string): string {
	if (!ip) return 'unknown';

	const trimmed = ip.trim();

	const colonIndex = trimmed.lastIndexOf(':');
	if (colonIndex !== -1 && colonIndex === trimmed.indexOf(':')) {
		return trimmed.substring(0, colonIndex);
	}

	const bracketIndex = trimmed.indexOf(']');
	if (bracketIndex !== -1 && trimmed.startsWith('[')) {
		return trimmed.substring(1, bracketIndex);
	}

	return trimmed;
}

function getClientIpFromForwardedHeader(request: Request, trustedProxies: string[]): null | string {
	const forwarded = request.headers.get('x-forwarded-for');
	if (!forwarded) return null;

	const ips = forwarded
		.split(',')
		.map((ip) => ip.trim())
		.filter((ip) => ip.length > 0);

	for (let i = ips.length - 1; i >= 0; i--) {
		const rawIp = ips[i];
		if (!rawIp) continue;

		const ip = sanitizeIpAddress(rawIp);

		if (!isValidIpAddress(ip)) {
			logger.warn(
				{ header: 'x-forwarded-for', ip: rawIp },
				'Invalid IP address in X-Forwarded-For header'
			);
			continue;
		}

		if (isTrustedProxy(ip, trustedProxies)) {
			logger.debug(
				{ ip, position: i, total: ips.length },
				'Trusted proxy found in X-Forwarded-For chain'
			);
			continue;
		}

		logger.debug(
			{ ip, position: i, total: ips.length },
			'Using non-trusted IP from X-Forwarded-For chain'
		);
		return ip;
	}

	logger.warn(
		{ forwarded, trustedProxies },
		'All IPs in X-Forwarded-For chain are trusted proxies, no client IP found'
	);
	return null;
}

function getSocketIp(request: Request): string | undefined {
	const server = getBunServer();
	if (!server) return undefined;

	const addr = server.requestIP(request);
	if (!addr) return undefined;

	const ip = sanitizeIpAddress(addr.address);
	return isValidIpAddress(ip) ? ip : undefined;
}

function getClientIpFromRealIpHeader(request: Request): null | string {
	const realIp = request.headers.get('x-real-ip');
	if (!realIp) return null;

	const sanitized = sanitizeIpAddress(realIp);
	if (isValidIpAddress(sanitized)) {
		logger.debug({ ip: sanitized, source: 'x-real-ip' }, 'Using X-Real-IP header');
		return sanitized;
	}

	logger.warn({ ip: realIp }, 'Invalid IP address in X-Real-IP header');
	return null;
}

function getClientIp(request: Request): string {
	// Prefer the value captured in Elysia's onRequest hook via captureClientIp().
	// That is the ONLY lifecycle stage where `server.requestIP(request)` reliably
	// returns the socket address for browser traffic — by the time the audit
	// plugin's onAfterResponse hook runs, Bun has dropped the request→socket
	// mapping and requestIP returns null. See the WeakMap doc at the top of
	// this file for the full explanation.
	const cached = clientIpByRequest.get(request);
	if (cached) return cached;

	const config = getConfig();
	const { trustedProxies, trustProxy } = config.server;
	const socketIp = getSocketIp(request);

	// Only trust proxy headers when trustProxy is enabled, trustedProxies are
	// configured, AND the direct socket peer is itself a trusted proxy.
	// Otherwise any client could spoof X-Forwarded-For/X-Real-IP headers.
	if (
		trustProxy &&
		trustedProxies.length > 0 &&
		socketIp &&
		isTrustedProxy(socketIp, trustedProxies)
	) {
		const forwardedIp = getClientIpFromForwardedHeader(request, trustedProxies);
		if (forwardedIp) return forwardedIp;

		const realIp = getClientIpFromRealIpHeader(request);
		if (realIp) return realIp;
	}

	if (socketIp) {
		return socketIp;
	}

	logger.debug('No valid IP found from any source, using fallback');
	return '0.0.0.0';
}

export { captureClientIp, getClientIp };
