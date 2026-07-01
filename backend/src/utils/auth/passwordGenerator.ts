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

function getCredentials(): GeneratedCredential[] {
	return SEED_USERS.map((info) => ({
		password: getDevPassword(info.username),
		username: info.username,
	}));
}

function getSeedUsersWithPasswords(
	useSecurePasswords = false
): (UserInfo & { password: string })[] {
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
	SEED_USER_COUNT,
	formatCredentialsForDisplay,
	generateSecurePassword,
	getCredentials,
	getSeedUsersWithPasswords,
};
