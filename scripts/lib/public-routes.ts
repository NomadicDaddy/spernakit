/**
 * The routes an unauthenticated caller is allowed to reach
 * (`scripts/test-public-route-surface.ts`).
 *
 * The authorization ordering gate next door proves that a guard runs before validation, which is a
 * property of the application. Whether a given route carries a guard at all is not: authorization
 * travels as a route option, so a route ships open by leaving `requireAuth` off, and nothing about
 * the omission looks wrong in review. Three route files hold guarded and unguarded handlers side by
 * side, so reading a file cannot answer the question either.
 *
 * This list is the answer, written down once. Everything registered on the application and absent
 * from it must refuse an anonymous caller; everything on it must state why it does not. The gate
 * checks the list in both directions, so an entry that no longer names a real route, or names one
 * that has since been guarded, fails rather than lingering as permission nobody meant to keep.
 */

/** One route that answers an anonymous caller, and the reason it has to. */
interface PublicRoute {
	/** The HTTP method, uppercase. */
	method: string;
	/** The registered path, parameters included as written (`/api/v1/x/:id`). */
	path: string;
	/** Why an anonymous caller reaches it. Read at review time; keep it about this route. */
	reason: string;
}

const PUBLIC_ROUTES: PublicRoute[] = [
	{
		method: 'GET',
		path: '/api/v1/health',
		reason: 'Liveness, read by the container runtime and the load balancer before any session exists.',
	},
	{
		method: 'GET',
		path: '/api/v1/health/ready',
		reason: 'Readiness, read by the same callers as liveness and for the same reason.',
	},
	{
		method: 'GET',
		path: '/api/v1/docs',
		reason: 'The API reference UI. It documents the surface rather than exposing any of it.',
	},
	{
		method: 'GET',
		path: '/api/v1/docs/json',
		reason: 'The OpenAPI document the reference UI renders, and what generated clients read.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/login',
		reason: 'Sign-in. There is no session to check, which is the point of the route.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/logout',
		reason: 'Clears the cookie. Refusing a caller who has none would leave a stale cookie in place.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/register',
		reason: 'Self-registration, gated by the registration setting rather than by a session.',
	},
	{
		method: 'GET',
		path: '/api/v1/auth/registration-status',
		reason: 'Tells the sign-in page whether to offer registration, before anyone has signed in.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/forgot-password',
		reason: 'Starts recovery for someone who cannot sign in. It answers the same either way.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/reset-password',
		reason: 'Completes recovery. The emailed token is the credential.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/verify-email',
		reason: 'Confirms an address from an emailed link, which is followed before signing in.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/confirm-email-change',
		reason: 'Confirms a change from an emailed link, which may be opened in another browser.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/mfa/verify',
		reason: 'The second factor. The first factor has been accepted but no session exists yet.',
	},
	{
		method: 'POST',
		path: '/api/v1/auth/mfa/verify-recovery',
		reason: 'The recovery code path through the same half-authenticated step.',
	},
	{
		method: 'GET',
		path: '/api/v1/auth/oauth/providers',
		reason: 'Lists the configured providers so the sign-in page can offer them.',
	},
	{
		method: 'GET',
		path: '/api/v1/auth/oauth/:provider',
		reason: 'Begins the provider redirect, which is how a caller with no session signs in.',
	},
	{
		method: 'GET',
		path: '/api/v1/auth/oauth/:provider/callback',
		reason: 'Where the provider returns. The provider state is the credential.',
	},
	{
		method: 'GET',
		path: '/api/v1/dashboards/shared/:token',
		reason: 'A share link. The token is the credential, and a shared dashboard is meant to be opened by someone with no account.',
	},
];

/**
 * The key a route is recognised by, on both sides of the comparison.
 *
 * @param method - The HTTP method, in any case.
 * @param path - The registered path, parameters as written.
 * @returns `GET /api/v1/health`.
 */
function routeKey(method: string, path: string): string {
	return `${method.toUpperCase()} ${path}`;
}

/**
 * The allowlist keyed for lookup.
 *
 * @returns Route key to the reason that route is public.
 */
function publicRouteIndex(): Map<string, string> {
	return new Map(
		PUBLIC_ROUTES.map((route) => [routeKey(route.method, route.path), route.reason]),
	);
}

export { PUBLIC_ROUTES, type PublicRoute, publicRouteIndex, routeKey };
