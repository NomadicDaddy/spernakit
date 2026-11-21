/**
 * The throwaway application the auth gates run their probes against.
 *
 * Standing the app up is a separate concern from the properties under test: a temp-file SQLite
 * database, the seed accounts, and a signed request are all things a gate needs to have before it
 * can ask its question, and none of them are the question. They live here so each gate reads as
 * the sequence of assertions it is. Two gates use this now, the ordering one it was written for
 * and the auth rate limit state one, and both want the same three things from it.
 */
import type { UserRole } from '../../backend/src/types/roles.ts';

import { getConfig, initializeConfig } from '../../backend/src/config/configLoader.ts';
import { createApiApp } from '../../backend/src/create-api-app.ts';
import { getDb } from '../../backend/src/db/index.ts';
import { users } from '../../backend/src/db/schema/users.ts';
import { seedUsersIfEmpty } from '../../backend/src/db/seed/users.ts';
import { signAccessToken } from '../../backend/src/plugins/auth.ts';
import { getSeedUsersWithPasswords } from '../../backend/src/utils/auth/passwordGenerator.ts';
import { startTempDatabase } from './temp-db-app.ts';
import { applyEphemeralAuthKeys } from './test-auth-keys.ts';

/** Low bcrypt cost: this gate hashes a handful of passwords and is not measuring the hash. */
const SEED_ROUNDS = 4;

type App = ReturnType<typeof createApiApp>;
type Claim = { id: number; role: UserRole };

/**
 * One request to the representative route.
 *
 * `claim` is what the caller's token says about them, which is deliberately not always the truth:
 * the freshness check below signs a stale role to prove the guard reads the database rather than
 * the token.
 *
 * `csrfToken` is separate from `claim` because being signed in and carrying a CSRF token are two
 * different things, and the ordering gate has to be able to send one without the other.
 */
function post(
	app: App,
	path: string,
	body: unknown,
	claim?: Claim,
	csrfToken?: string,
): Promise<Response> {
	return sendJson(app, 'POST', path, body, claim, csrfToken);
}

/**
 * The same request as `post`, sent as a PUT.
 *
 * Separate rather than a method argument on `post` because every existing caller reads as a
 * POST and should keep reading that way; a gate that needs the other verb says so at the call
 * site.
 *
 * @param app - The running fixture application.
 * @param path - The path to request, including the /api/v1 prefix.
 * @param body - The request body, serialized as JSON.
 * @param claim - The identity to sign into a cookie, or nothing for an anonymous request.
 * @param csrfToken - The CSRF token to send, or nothing to send none.
 * @returns The application’s response.
 */
function put(
	app: App,
	path: string,
	body: unknown,
	claim?: Claim,
	csrfToken?: string,
): Promise<Response> {
	return sendJson(app, 'PUT', path, body, claim, csrfToken);
}

/**
 * The same request as `post`, sent as a DELETE with no body.
 *
 * @param app - The running fixture application.
 * @param path - The path to request, including the /api/v1 prefix.
 * @param claim - The identity to sign into a cookie, or nothing for an anonymous request.
 * @param csrfToken - The CSRF token to send, or nothing to send none.
 * @returns The application’s response.
 */
function del(app: App, path: string, claim?: Claim, csrfToken?: string): Promise<Response> {
	return sendJson(app, 'DELETE', path, undefined, claim, csrfToken);
}

/** The one place a signed, CSRF-carrying JSON request is built. */
function sendJson(
	app: App,
	method: 'DELETE' | 'POST' | 'PUT',
	path: string,
	body: unknown,
	claim?: Claim,
	csrfToken?: string,
): Promise<Response> {
	const config = getConfig();
	const headers: Record<string, string> = { origin: config.server.frontendUrl };
	// A bodiless DELETE sends no content type, as a browser's fetch would.
	if (body !== undefined) headers['content-type'] = 'application/json';
	if (claim) {
		headers.cookie = `${config.security.authCookieName}=${signAccessToken(claim)}`;
	}
	if (csrfToken) {
		headers['X-CSRF-Token'] = csrfToken;
	}
	return app.handle(
		new Request(`http://localhost${path}`, {
			body: JSON.stringify(body),
			headers,
			method,
		}),
	);
}
/**
 * One GET, signed in as `claim` when one is given.
 *
 * Separate from `post` rather than folded into it because a GET carries no body and no CSRF
 * token, and a helper that took both and used neither would invite a caller to pass them.
 *
 * @param app - The running fixture application.
 * @param path - The path to request, including the /api/v1 prefix.
 * @param claim - The identity to sign into a cookie, or nothing for an anonymous request.
 * @returns The application's response.
 */
function get(app: App, path: string, claim?: Claim): Promise<Response> {
	const config = getConfig();
	const headers: Record<string, string> = { origin: config.server.frontendUrl };
	if (claim) {
		headers.cookie = `${config.security.authCookieName}=${signAccessToken(claim)}`;
	}
	return app.handle(new Request(`http://localhost${path}`, { headers }));
}

/**
 * Bring up the application against a fresh temp-file database and hand back a way to tear it down.
 *
 * Rate limiting starts off because most of the gate's probes send the same request several times
 * in a row; the one probe that cares turns it back on for itself. The seed's password-change
 * requirement is cleared for the same reason: its guard would answer every probe past the
 * transform stage with a 403 for a reason that has nothing to do with ordering.
 *
 * @param repoRoot - The template root, used to find the migrations directory.
 * @returns The running app and a `dispose` that closes the database and removes the temp files.
 */
async function startFixture(repoRoot: string): Promise<{ app: App; dispose: () => Promise<void> }> {
	initializeConfig();
	const config = getConfig();
	applyEphemeralAuthKeys(config.security);
	config.rateLimit.enabled = false;
	config.rateLimit.authEnabled = false;

	const { dispose } = startTempDatabase(repoRoot, 'spernakit-auth-ordering-');
	await seedUsersIfEmpty(getDb(), getSeedUsersWithPasswords(false), SEED_ROUNDS);
	getDb().update(users).set({ requiresPasswordChange: false }).run();

	return { app: createApiApp(), dispose };
}

export { del, get, post, put, startFixture };
export type { App, Claim };
