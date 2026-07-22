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
 * Extract an embedded IPv4 address from an IPv4-mapped or IPv4-compatible
 * IPv6 literal, in either dotted (`::ffff:169.254.169.254`, `::169.254.169.254`)
 * or hex-embedded (`::ffff:a9fe:a9fe`) form. These addresses route to the
 * embedded IPv4 on dual-stack hosts, so the embedded value must be re-checked
 * against the blocked IPv4 ranges.
 *
 * @param normalized - A lowercased IPv6 address string.
 * @returns The embedded dotted-decimal IPv4, or null when none is present.
 */
function embeddedIpv4(normalized: string): null | string {
	// Dotted form: any trailing `:a.b.c.d` (covers ::ffff:1.2.3.4, ::1.2.3.4,
	// ::ffff:0:1.2.3.4).
	const dotted = /:((?:\d{1,3}\.){3}\d{1,3})$/.exec(normalized);
	if (dotted) return dotted[1]!;

	// Hex-embedded mapped form: ::ffff:HHHH:HHHH
	const hex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(normalized);
	if (hex) {
		const high = Number.parseInt(hex[1]!, 16);
		const low = Number.parseInt(hex[2]!, 16);
		return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
	}

	return null;
}

/**
 * Check if an IPv6 address string falls within blocked ranges.
 *
 * @param ip - The IPv6 address to check.
 * @returns True if the IP is loopback, unspecified, link-local, unique-local,
 * or an IPv4-mapped/compatible literal whose embedded IPv4 is blocked.
 */
function isBlockedIpv6(ip: string): boolean {
	const normalized = ip.toLowerCase();
	if (
		normalized === '::1' ||
		normalized === '::' ||
		normalized.startsWith('fe80:') ||
		normalized.startsWith('fc') ||
		normalized.startsWith('fd')
	) {
		return true;
	}

	// IPv4-mapped / IPv4-compatible literals (e.g. ::ffff:169.254.169.254) are
	// routed to the embedded IPv4 on dual-stack hosts, so re-check the embedded
	// address against the blocked IPv4 ranges.
	const embedded = embeddedIpv4(normalized);
	return embedded !== null && isBlockedIpv4(embedded);
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
	// 100.64.0.0/10 (CGNAT / carrier-grade NAT shared address space)
	if (a === 100 && b !== undefined && b >= 64 && b <= 127) return true;
	// 0.0.0.0
	if (a === 0) return true;

	return false;
}

export { isBlockedIpv4, validateWebhookUrl };
export type { WebhookValidationResult };
