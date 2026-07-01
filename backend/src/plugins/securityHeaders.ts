import { Elysia } from 'elysia';

import { getConfig } from '../config/configLoader.ts';

/** HSTS max-age: 1 year in seconds (365 * 24 * 60 * 60) */
const HSTS_MAX_AGE_SECONDS = 31_536_000;

/**
 * Elysia plugin that sets standard HTTP security headers on all responses.
 * CSP is configurable via config.security.strictCsp - a baseline CSP is always applied.
 *
 * ## Security Considerations
 *
 * ### `style-src 'unsafe-inline'`
 *
 * The strict CSP policy includes `'unsafe-inline'` in `style-src`. This is a
 * deliberate trade-off required because:
 *
 * 1. **Radix UI** injects inline styles for positioning (popovers, dropdowns,
 *    tooltips, dialogs). These use `style="--radix-*"` CSS custom properties
 *    that cannot be predicted at build time for nonce/hash approaches.
 *
 * 2. **React's style prop** generates inline styles (e.g., `style={{ width }}`).
 *
 * 3. **CSS-in-JS patterns** from dependencies may inject runtime styles.
 *
 * ### Mitigations
 *
 * - `script-src` remains strict (no `'unsafe-inline'`, uses nonce/hash)
 * - XSS via style injection is lower severity than script injection
 * - All user content is sanitized before rendering
 * - `X-Content-Type-Options: nosniff` prevents MIME confusion
 *
 * ### Future Improvements
 *
 * When Radix UI supports CSS custom properties via stylesheets instead of
 * inline styles, remove `'unsafe-inline'` from `style-src` and use
 * nonce-based CSP for all style sources.
 *
 * ### Verification
 *
 * Run the app with `strictCsp: true` and check the browser console for CSP
 * violations. All violations should be investigated and resolved.
 *
 * ## Cross-Origin Isolation Headers
 *
 * - `Cross-Origin-Opener-Policy: same-origin` — prevents cross-origin windows
 *   (popups, `target="_blank"`) from retaining a reference to the app window
 *   via `window.opener`. Safe here because OAuth uses full-page redirects
 *   (see `frontend/src/components/auth/OAuthProviderButtons.tsx`
 *   `redirectToOAuth`) rather than popup flows.
 *
 * - `Cross-Origin-Resource-Policy: same-origin` — blocks other origins from
 *   embedding the app's responses via `<img>`, `<script>`, `<link>`. Safe
 *   unconditionally because all frontend assets are served from the app
 *   origin (fonts via `@fontsource-variable/inter`, no CDN).
 *
 * - `Cross-Origin-Embedder-Policy: require-corp` — opt-in via
 *   `config.security.crossOriginEmbedderPolicy`. When enabled, all
 *   cross-origin subresources must send CORP or CORS; since the frontend
 *   does not load cross-origin resources this is safe for base deployments,
 *   but downstream apps that add third-party analytics, OAuth provider
 *   logos, or CDN-hosted images must either self-host or serve those
 *   resources with `Cross-Origin-Resource-Policy: cross-origin` before
 *   enabling this flag.
 */
function applySecurityHeaders(headers: Record<string, string>): void {
	const config = getConfig();

	headers['X-Content-Type-Options'] = 'nosniff';
	headers['X-Frame-Options'] = 'DENY';
	headers['X-XSS-Protection'] = '0';
	headers['Referrer-Policy'] = 'no-referrer';
	headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()';

	headers['Cross-Origin-Opener-Policy'] = 'same-origin';
	headers['Cross-Origin-Resource-Policy'] = 'same-origin';
	if (config.security.crossOriginEmbedderPolicy) {
		headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
	}

	// Default to no-store for all API responses to prevent browser/proxy caching
	// of sensitive data. Routes that need caching can override via setCacheHeaders().
	if (!headers['Cache-Control']) {
		headers['Cache-Control'] = 'no-store';
	}

	if (config.security.strictCsp) {
		// Strict CSP with all directives
		// style-src 'unsafe-inline' is required by Radix UI (shadcn/ui) which injects
		// inline styles at runtime. CSP nonces would require SSR to inject into HTML.
		// script-src hash whitelists the inline theme-init script in index.html that
		// prevents flash of incorrect theme (FOIT). Update hash if that script changes.
		const isDev = config.server.nodeEnv === 'development';
		const connectSrc = isDev ? "'self' ws: wss:" : "'self' wss:";
		headers['Content-Security-Policy'] = [
			"default-src 'self'",
			"script-src 'self' 'sha256-Iv7srDSoOnDH3hHGa4+d2uupeV5QEc+dDe2mrrrUZZc='",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data:",
			`connect-src ${connectSrc}`,
			"font-src 'self' data:",
			"worker-src 'self' blob:",
			"object-src 'none'",
			"base-uri 'self'",
			"form-action 'self'",
			"frame-src 'none'",
			"frame-ancestors 'none'",
		].join('; ');
	} else {
		// Baseline CSP even when strict mode is disabled for defense-in-depth.
		// Explicit directives match the strict policy to prevent unexpected behavior
		// if default-src is ever relaxed.
		const isDev = config.server.nodeEnv === 'development';
		const connectSrc = isDev ? "'self' ws: wss:" : "'self' wss:";
		headers['Content-Security-Policy'] = [
			"default-src 'self'",
			"script-src 'self'",
			"style-src 'self' 'unsafe-inline'",
			"img-src 'self' data:",
			`connect-src ${connectSrc}`,
			"font-src 'self' data:",
			"worker-src 'self' blob:",
			"object-src 'none'",
			"base-uri 'self'",
			"frame-src 'none'",
			"frame-ancestors 'none'",
			"form-action 'self'",
		].join('; ');
	}

	// HSTS: Enable in all non-development environments to prevent SSL stripping attacks
	if (config.server.nodeEnv !== 'development') {
		headers['Strict-Transport-Security'] =
			`max-age=${HSTS_MAX_AGE_SECONDS}; includeSubDomains; preload`;
	}
}

// Hooks MUST declare `as: 'scoped'` so they apply to sibling handlers on the
// parent app. Without this, Elysia treats the hooks as local — they only run
// for handlers registered on this plugin instance (there are none), and no
// security headers are emitted. This matches the cors plugin pattern.
const securityHeadersPlugin = new Elysia({ name: 'security-headers' })
	.onAfterHandle({ as: 'scoped' }, ({ set }) => {
		applySecurityHeaders(set.headers as Record<string, string>);
	})
	.onError({ as: 'scoped' }, ({ set }) => {
		applySecurityHeaders(set.headers as Record<string, string>);
	});

export { securityHeadersPlugin };
