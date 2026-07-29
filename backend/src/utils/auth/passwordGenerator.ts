/**
 * Password generation utilities for development seeding.
 * Each dev user gets a predictable password: {username}123
 */

import type { UserRole } from '../../types/roles.ts';

interface GeneratedCredential {
	password: string;
	username: string;
}

const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const PASSWORD_LENGTH = 16;

/** Maximum byte value that avoids modulo bias for the given charset length. */
const MAX_UNBIASED_BYTE = Math.floor(256 / CHARSET.length) * CHARSET.length;

function generateSecurePassword(length: number = PASSWORD_LENGTH): string {
	let password = '';
	while (password.length < length) {
		// Generate extra bytes to account for rejection sampling discards
		const batchSize = length - password.length + 10;
		const bytes = new Uint8Array(batchSize);
		crypto.getRandomValues(bytes);
		for (let i = 0; i < batchSize && password.length < length; i++) {
			const byte = bytes[i];
			if (byte === undefined || byte >= MAX_UNBIASED_BYTE) continue;
			password += CHARSET[byte % CHARSET.length];
		}
	}
	return password;
}

interface UserInfo {
	email: string;
	role: UserRole;
	username: string;
}

const SEED_USERS: UserInfo[] = [
	{ email: 'sysop@example.com', role: 'SYSOP', username: 'sysop' },
	{ email: 'admin@example.com', role: 'ADMIN', username: 'admin' },
	{ email: 'manager@example.com', role: 'MANAGER', username: 'manager' },
	{ email: 'operator@example.com', role: 'OPERATOR', username: 'operator' },
	{ email: 'viewer@example.com', role: 'VIEWER', username: 'viewer' },
];

/** Number of users created by the seed process — used by onboarding to detect manually-added users. */
const SEED_USER_COUNT = SEED_USERS.length;

function getDevPassword(username: string): string {
	return `${username}123`;
}

interface SeedCredential {
	email: string;
	password: string;
}

/**
 * The development-seed credential for a role, or undefined when no seed user holds that role.
 *
 * This is the single source both the seed orchestration and `scripts/crawltest.ts` read, so
 * neither has to hard-code `sysop@example.com` or its password: a derived app that renames its
 * SYSOP account changes SEED_USERS and both callers follow.
 *
 * The password is the DEVELOPMENT one — `getSeedUsersWithPasswords(false)`. A production seed
 * generates a random password for the same account, so this credential is only valid where the
 * database was seeded in development, and callers must not fall back to it otherwise.
 *
 * @param role - The seed role to look up.
 * @returns The role's development-seed email and password, or undefined when no seed user holds it.
 */
function getSeedCredential(role: UserRole): SeedCredential | undefined {
	const info = SEED_USERS.find((user) => user.role === role);
	if (!info) return undefined;
	return { email: info.email, password: getDevPassword(info.username) };
}

/**
 * The account crawltest will sign in as, so the seed can exempt it from a forced password change.
 *
 * `scripts/crawltest.ts` falls back to the SYSOP development-seed credential when
 * `testing.crawlLoginEmail` is blank, which is the template default. Resolving the same fallback
 * on the seeding side keeps the two ends agreeing: without it, an app with the "Require Password
 * Change on First Login" setting ON seeds sysop with the flag set, and every request the crawl
 * makes is then bounced by passwordChangeGuard.
 *
 * Production is excluded deliberately. There the seed generates a random password, so crawltest
 * cannot use this account anyway, and clearing the flag would leave a default-addressed SYSOP
 * account with no first-login password change.
 *
 * @param configuredEmail - `testing.crawlLoginEmail` as configured; wins whenever it is non-empty.
 * @param isProduction - Whether this seed run is creating production accounts.
 * @returns The crawl account's email, or undefined when there is nothing to exempt.
 */
function resolveCrawlEmail(configuredEmail: string, isProduction: boolean): string | undefined {
	if (configuredEmail) return configuredEmail;
	if (isProduction) return undefined;
	return getSeedCredential('SYSOP')?.email;
}

function getCredentials(): GeneratedCredential[] {
	return SEED_USERS.map((info) => ({
		password: getDevPassword(info.username),
		username: info.username,
	}));
}

function getSeedUsersWithPasswords(
	useSecurePasswords = false,
): ({ password: string } & UserInfo)[] {
	return SEED_USERS.map((info) => ({
		...info,
		password: useSecurePasswords ? generateSecurePassword(24) : getDevPassword(info.username),
	}));
}

function formatCredentialsForDisplay(credentials: GeneratedCredential[]): string {
	const lines = ['\n=== Development Credentials ===\n'];

	for (const cred of credentials) {
		lines.push(`  ${cred.username.padEnd(10)} | ${cred.password}`);
	}

	lines.push('\n===============================\n');
	return lines.join('\n');
}

export {
	formatCredentialsForDisplay,
	generateSecurePassword,
	getCredentials,
	getSeedCredential,
	getSeedUsersWithPasswords,
	resolveCrawlEmail,
	SEED_USER_COUNT,
};
export type { SeedCredential };
