/**
 * Paths registered in `publicRoutes`, kept in a leaf module so the API layer can consult them
 * without importing the router (and the whole lazy-page graph behind it).
 */
export const PUBLIC_PATHS = {
	authCallback: '/auth/callback',
	changePassword: '/change-password',
	confirmEmailChange: '/confirm-email-change',
	forgotPassword: '/forgot-password',
	login: '/login',
	mfaVerify: '/mfa-verify',
	register: '/register',
	resetPassword: '/reset-password',
	sharedDashboard: '/dashboards/shared/:token',
	verifyEmail: '/verify-email',
} as const;

/**
 * The subset of public paths a visitor reaches with no session at all. A 401 here is the
 * expected answer to an authenticated-only request, not a session that expired, so the global
 * handler must not log the visitor out and hard-navigate them to /login.
 *
 * `/change-password` and `/mfa-verify` are deliberately excluded: they are mid-authentication
 * states that do hold a session, and a genuine expiry there should still land on /login.
 */
const ANONYMOUS_PATHS: readonly string[] = [
	PUBLIC_PATHS.authCallback,
	PUBLIC_PATHS.confirmEmailChange,
	PUBLIC_PATHS.forgotPassword,
	PUBLIC_PATHS.login,
	PUBLIC_PATHS.register,
	PUBLIC_PATHS.resetPassword,
	PUBLIC_PATHS.sharedDashboard,
	PUBLIC_PATHS.verifyEmail,
];

/**
 * Whether `pathname` is a route that renders without a session.
 *
 * Patterns ending in a `:param` segment match by prefix; everything else matches exactly,
 * ignoring a trailing slash.
 */
export function isAnonymousPath(pathname: string): boolean {
	const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;

	return ANONYMOUS_PATHS.some((pattern) => {
		const paramIndex = pattern.indexOf('/:');
		if (paramIndex === -1) return path === pattern;

		// `/dashboards/shared/:token` matches `/dashboards/shared/<anything non-empty>`.
		const prefix = pattern.slice(0, paramIndex + 1);
		return path.startsWith(prefix) && path.length > prefix.length;
	});
}
