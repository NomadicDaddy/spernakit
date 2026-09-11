/**
 * The address the dev and preview proxies dial to reach the backend.
 *
 * Both proxy blocks used to dial `http://localhost:<backendPort>` while the backend binds
 * `server.host`, which is `127.0.0.1` by default and therefore IPv4 only. On a machine where
 * `localhost` resolves to both `::1` and `127.0.0.1`, Node hands the connection to its dual-stack
 * path, and an attempt on `::1` reaches nothing at all. Given a spare moment it falls back to the
 * IPv4 address and the request succeeds, which is why the failure only appeared under load: the
 * crawler recycling its browser opened a burst of connections at once, an attempt timed out instead
 * of falling back, and Vite answered 502. Six applications in the fleet reported the same 502 out
 * of their own crawl gate, where an intermittent false failure is worse than a steady one because
 * it teaches everyone to ignore the gate.
 *
 * So the proxy dials the address the backend actually binds, and the two can no longer disagree.
 * A wildcard bind is not an address anything can dial, so it maps to the loopback address of its
 * own family. An IPv6 literal is bracketed because the result goes into a URL. Anything else is a
 * host the configuration named on purpose and is passed through as written.
 */
function backendProxyHost(host: string): string {
	const trimmed = host.trim();
	if (trimmed === '' || trimmed === '0.0.0.0') return '127.0.0.1';
	if (trimmed === '::' || trimmed === '::0') return '[::1]';
	if (trimmed.startsWith('[')) return trimmed;
	if (trimmed.includes(':')) return `[${trimmed}]`;
	return trimmed;
}

/** `host:port` for the backend, ready to be pasted after a scheme. */
function backendProxyAuthority(host: string, port: number): string {
	return `${backendProxyHost(host)}:${String(port)}`;
}

export { backendProxyAuthority };
