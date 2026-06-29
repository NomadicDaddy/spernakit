import { promises as dns } from 'node:dns';

import { isLoopbackAddressOrHostname } from './loopback.ts';

interface WebhookValidationResult {
	/** Error message if validation failed, null if valid */
	error: null | string;
	/** Original hostname for Host header when using resolved IP */
	originalHost?: string;
	/** URL rewritten with the resolved IP to prevent DNS rebinding TOCTOU */
	resolvedUrl?: string;
}

/**
 * Validate a webhook/notification URL for SSRF protection.
 * Blocks private IPs, loopback, link-local, and non-HTTP schemes.
 * Performs DNS resolution to prevent DNS rebinding attacks where a hostname
 * resolves to a private IP address.
 *
 * @param url - The URL string to validate.
 * @returns Validation result with error message or resolved URL details.
 */
async function validateWebhookUrl(url: string): Promise<WebhookValidationResult> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { error: 'Invalid URL format' };
	}

	// Only allow http and https schemes
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return {
			error: `Scheme '${parsed.protocol}' is not allowed; only http: and https: are permitted`,
		};
	}

	const hostname = parsed.hostname.toLowerCase();

	// Block loopback addresses
	if (isLoopbackAddressOrHostname(hostname)) {
		return { error: 'Loopback addresses are not allowed' };
	}

	// Block private IPv4 ranges and metadata endpoints (direct IP)
	if (isBlockedIpv4(hostname)) {
		return { error: 'Private/internal IP addresses are not allowed' };
	}

	// Block IPv6 link-local and loopback
	if (hostname.startsWith('[')) {
		const ipv6 = hostname.slice(1, -1);
		if (isBlockedIpv6(ipv6)) {
			return { error: 'Private/link-local IPv6 addresses are not allowed' };
		}
	}

	// DNS resolution check: resolve hostname and verify all IPs are public.
	// This prevents DNS rebinding attacks where a domain resolves to a private IP.
	const isDirectIp = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.startsWith('[');
	if (!isDirectIp) {
		const result = await resolveAndValidate(hostname);
		if (result.error) return { error: result.error };

		// Rewrite URL with resolved IP to prevent DNS rebinding TOCTOU
		const rewritten = new URL(url);
		rewritten.hostname = result.ip;
		return {
			error: null,
			originalHost: parsed.host,
			resolvedUrl: rewritten.toString(),
		};
	}

	return { error: null, resolvedUrl: url };
}

interface ResolveResult {
	error?: string;
	ip: string;
}

/**
 * Resolve a hostname via DNS and check all resolved IPs against blocked ranges.
 * Returns the first safe resolved IP for URL rewriting.
 *
 * Uses `dns.lookup` (OS resolver via getaddrinfo) rather than `dns.resolve4` /
 * `dns.resolve6` (c-ares) so resolution honors the host's configured resolver
 * stack — c-ares returns ECONNREFUSED in environments where its inherited DNS
 * server list is unreachable, which otherwise blocks every public hostname.
 *
 * @param hostname - The hostname to resolve
 * @returns Resolve result with first safe IP, or error message
 */
async function resolveAndValidate(hostname: string): Promise<ResolveResult> {
	const ips: string[] = [];

	try {
		const records = await dns.lookup(hostname, { all: true });
		for (const record of records) {
			ips.push(record.address);
		}
	} catch {
		// Swallow and fall through to the empty-ips branch below so callers
		// receive the consistent "could not be resolved" error message.
	}

	if (ips.length === 0) {
		return { error: `Hostname '${hostname}' could not be resolved`, ip: '' };
	}

	for (const ip of ips) {
		if (isBlockedIpv4(ip)) {
			return { error: 'Hostname resolves to blocked private IP address', ip: '' };
		}
		if (isBlockedIpv6(ip)) {
			return { error: 'Hostname resolves to blocked private IPv6 address', ip: '' };
		}
	}

	// ips is guaranteed non-empty due to the length check above
	return { ip: ips[0]! };
}

/**
 * Check if an IPv6 address string falls within blocked ranges.
 *
 * @param ip - The IPv6 address to check.
 * @returns True if the IP is loopback, link-local, or unique-local.
 */
function isBlockedIpv6(ip: string): boolean {
	const normalized = ip.toLowerCase();
	return (
		normalized === '::1' ||
		normalized.startsWith('fe80:') ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd')
	);
}

/**
 * Check if an IPv4 address string falls within blocked ranges.
 *
 * @param hostname - The hostname to check (may be an IP or domain).
 * @returns True if the IP is in a blocked range.
 */
function isBlockedIpv4(hostname: string): boolean {
	// Match dotted-decimal IPv4
	const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
	if (!ipv4Match) return false;

	const [, a, b] = ipv4Match.map(Number) as [number, number, number, number, number];

	// 10.0.0.0/8
	if (a === 10) return true;
	// 172.16.0.0/12
	if (a === 172 && b !== undefined && b >= 16 && b <= 31) return true;
	// 192.168.0.0/16
	if (a === 192 && b === 168) return true;
	// 127.0.0.0/8 (loopback)
	if (a === 127) return true;
	// 169.254.0.0/16 (link-local / AWS metadata)
	if (a === 169 && b === 254) return true;
	// 0.0.0.0
	if (a === 0) return true;

	return false;
}

export { isBlockedIpv4, validateWebhookUrl };
export type { WebhookValidationResult };
