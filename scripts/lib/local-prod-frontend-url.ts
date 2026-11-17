/**
 * The frontend-URL rule for deploy:local-prod.
 *
 * The local-prod config always sets security.cookieSecure=true, because the production validator
 * rejects false. A browser never sends a Secure cookie over plain HTTP to an ordinary host, so the
 * URL must be HTTPS or plain HTTP on a loopback host (localhost, *.localhost, 127.0.0.0/8, [::1]).
 */

/** Whether a hostname is loopback, which browsers treat as a secure context over plain HTTP. */
function isLoopbackHost(hostname: string): boolean {
	if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
	if (hostname === '[::1]') return true;
	return /^127(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * Why a frontend URL cannot carry the deploy's Secure auth cookies, or null when it can.
 *
 * @param frontendUrl - The browser-facing URL the deploy will serve.
 * @returns A one-line refusal reason, or null for an HTTPS or loopback-HTTP URL.
 */
export function frontendUrlRefusal(frontendUrl: string): null | string {
	let parsed: URL;
	try {
		parsed = new URL(frontendUrl);
	} catch {
		return `--frontend-url is not a valid URL: ${frontendUrl}`;
	}
	if (parsed.protocol === 'https:') return null;
	if (parsed.protocol === 'http:' && isLoopbackHost(parsed.hostname)) return null;
	return (
		`--frontend-url must be HTTPS, or plain HTTP on a loopback host, got ${frontendUrl}. ` +
		`Production auth cookies are Secure, so browsers drop them over plain HTTP elsewhere. ` +
		`Front the deploy with a TLS proxy (Caddy + mkcert) and pass --frontend-url https://...`
	);
}
