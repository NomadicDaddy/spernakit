#!/usr/bin/env bun
/**
 * Gate: refresh and logout have rate-limit buckets of their own, apart from the per-IP login
 * bucket (`.aidd/features/audit-logic-1790885878-token-refresh-counts-against-the-10-per-15-minute-per-ip-brute-force-bucket-and-`).
 *
 * The defect: every non-GET /api/v1/auth/ request counted against one auth:<ip> bucket, ten per
 * fifteen minutes by default. A burst of failed logins from one address, or eleven people behind
 * one NAT, left that address's next refresh answered 429, which the browser treats as a signed-out
 * session. Runs the real application in process against a throwaway temp-file database, with auth
 * rate limiting on and every request from the same address:
 *  1. A burst of failed logins is refused as rate limited, and so is the same path with a trailing
 *     slash, which the router also accepts.
 *  2. Straight after it, a signed-in user's refresh still succeeds, with or without the slash.
 *  3. A refresh with no valid token is refused as unauthenticated (401), not by the login bucket.
 *  5. One sign-in that spends its whole budget is limited, and the same user's other sign-in still
 *     refreshes: buckets are per refresh family, not per user.
 *  6. Refreshes with no valid token have their own per-IP bucket, and it limits.
 *  4. Even then, a signed-in logout succeeds: it is keyed by its verified access cookie (the
 *     refresh cookie is scoped to the refresh route and never reaches logout), not by the
 *     exhausted anonymous bucket and not by the login bucket. Run last for that reason.
 */
import { resolve } from 'node:path';
import { exit } from 'node:process';

import { getConfig } from '../backend/src/config/configLoader.ts';
import { AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS } from '../backend/src/constants/rateLimit.ts';
import { signTokenPair } from '../backend/src/plugins/authTokens.ts';
import { generateAndStoreCsrfToken } from '../backend/src/plugins/csrf.ts';
import {
	newRefreshFamilyId,
	storeRefreshSession,
} from '../backend/src/utils/auth/refreshSessions.ts';
import { type App, post, seedUserId, startFixture } from './lib/auth-ordering-fixture.ts';

const repoRoot = resolve(import.meta.dir, '..');
/** More failed logins than the default allowance of ten. */
const LOGIN_BURST = 14;

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/** A refresh cookie for a new live sign-in of the given seed user. */
function signedIn(userId: number): string {
	const familyId = newRefreshFamilyId();
	const { refreshToken } = signTokenPair({ id: userId, role: 'OPERATOR', sid: familyId });
	storeRefreshSession(userId, familyId, refreshToken);
	return refreshToken;
}

/** Let the audit plugin's onAfterResponse write land while the database is still open. */
async function settle(): Promise<void> {
	await new Promise((settled) => setTimeout(settled, 0));
}

async function refresh(app: App, refreshToken?: string, path = '/api/v1/auth/refresh') {
	const config = getConfig();
	const headers: Record<string, string> = { origin: config.server.frontendUrl };
	if (refreshToken) headers.cookie = `${config.security.refreshCookieName}=${refreshToken}`;
	const res = await app.handle(
		new Request(`http://localhost${path}`, { headers, method: 'POST' }),
	);
	await settle();
	return res;
}

async function failedLogin(app: App, path: string): Promise<number> {
	const body = { password: 'definitely-wrong-password', username: 'no-such-user' };
	const res = await post(app, path, body);
	await settle();
	return res.status;
}

async function loginBucket(app: App, userId: number): Promise<void> {
	let lastLogin = 0;
	for (let attempt = 0; attempt < LOGIN_BURST; attempt += 1) {
		lastLogin = await failedLogin(app, '/api/v1/auth/login');
	}
	assert(lastLogin === 429, `1: the login burst should end limited, got ${String(lastLogin)}`);
	const alias = await failedLogin(app, '/api/v1/auth/login/');
	assert(alias === 429, `1: /auth/login/ should share the login bucket, got ${String(alias)}`);

	const plain = await refresh(app, signedIn(userId));
	assert(plain.status === 200, `2: a valid refresh should succeed, got ${String(plain.status)}`);
	const slashed = await refresh(app, signedIn(userId), '/api/v1/auth/refresh/');
	assert(
		slashed.status === 200,
		`2: /auth/refresh/ should succeed, got ${String(slashed.status)}`,
	);

	const anonymous = await refresh(app);
	assert(
		anonymous.status === 401,
		`3: a tokenless refresh should be 401, got ${String(anonymous.status)}`,
	);
}

async function logoutBucket(app: App, userId: number): Promise<void> {
	const claim = { id: userId, role: 'OPERATOR' as const };
	const res = await post(
		app,
		'/api/v1/auth/logout',
		{},
		claim,
		await generateAndStoreCsrfToken(userId),
	);
	await settle();
	assert(res.status === 200, `4: a signed-in logout should succeed, got ${String(res.status)}`);
}

async function familyBuckets(app: App, userId: number): Promise<void> {
	const spent = signedIn(userId);
	let last = 0;
	for (let attempt = 0; attempt <= AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
		last = (await refresh(app, spent)).status;
	}
	assert(last === 429, `5: a sign-in past its budget should be limited, got ${String(last)}`);
	const other = await refresh(app, signedIn(userId));
	assert(
		other.status === 200,
		`5: the user's other sign-in should refresh, got ${String(other.status)}`,
	);

	let tokenless = 0;
	for (let attempt = 0; attempt <= AUTH_SESSION_RATE_LIMIT_MAX_REQUESTS; attempt += 1) {
		tokenless = (await refresh(app, 'not-a-valid-token')).status;
	}
	assert(tokenless === 429, `6: the tokenless bucket should limit, got ${String(tokenless)}`);
}

const { app, dispose } = await startFixture(repoRoot);
try {
	// The fixture starts with auth limiting off; this gate is about what it does when on.
	getConfig().rateLimit.authEnabled = true;
	const userId = seedUserId('OPERATOR');
	await loginBucket(app, userId);
	await familyBuckets(app, userId);
	await logoutBucket(app, userId);
} finally {
	await dispose();
}

if (failures.length > 0) {
	console.error(`auth session rate limit: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log('auth session rate limit: all checks passed');
