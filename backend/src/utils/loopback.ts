/** URL hostname comparisons include the literal localhost name. */
const LOOPBACK_HOSTNAMES: ReadonlySet<string> = new Set(['localhost', '127.0.0.1', '::1']);
/** Socket-address comparisons include IPv4-mapped IPv6 loopback. */
const LOOPBACK_IPS: ReadonlySet<string> = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

function normalizeLoopbackCandidate(value: string): string {
	const normalized = value.toLowerCase();
	if (normalized.startsWith('[') && normalized.endsWith(']')) {
		return normalized.slice(1, -1);
	}
	return normalized;
}

function isIpv4MappedLoopback(value: string): boolean {
	return value.startsWith('::ffff:127.') || /^::ffff:7f[0-9a-f]{2}:/i.test(value);
}

function isLoopbackAddressOrHostname(value: string): boolean {
	const normalized = normalizeLoopbackCandidate(value);
	return (
		LOOPBACK_IPS.has(normalized) ||
		LOOPBACK_HOSTNAMES.has(normalized) ||
		isIpv4MappedLoopback(normalized)
	);
}

export { isLoopbackAddressOrHostname, LOOPBACK_HOSTNAMES, LOOPBACK_IPS };
