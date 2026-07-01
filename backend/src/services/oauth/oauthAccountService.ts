import { and, eq, like } from 'drizzle-orm';

import type {
	HandleCallbackResult,
	OAuthProfile,
	OAuthProvider,
	OAuthTokens,
} from './oauthTypes.ts';

import { getDb } from '../../db/index.ts';
import { oauthAccounts } from '../../db/schema/oauthAccounts.ts';
import { users } from '../../db/schema/users.ts';
import { generateSecurePassword } from '../../utils/auth/passwordGenerator.ts';
import { encrypt } from '../../utils/encryption.ts';
import { logger } from '../../utils/logger.ts';
import { hashPassword } from '../authService.ts';
import { addMemberToDefaultWorkspace, isMemberOfDefaultWorkspace } from '../workspaceService.ts';

/** Providers known to reliably verify email addresses before reporting emailVerified: true. */
const TRUSTED_EMAIL_PROVIDERS = new Set<OAuthProvider>(['google', 'microsoft']);

const USERNAME_PATTERN = /^[a-zA-Z0-9_.-]+$/;
const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = 50;

interface EncryptedTokens {
	accessTokenEncrypted: string;
	refreshTokenEncrypted: null | string;
}

async function encryptOAuthTokens(oauthTokens: OAuthTokens): Promise<EncryptedTokens> {
	const [accessTokenEncrypted, refreshTokenEncrypted] = await Promise.all([
		encrypt(oauthTokens.accessToken),
		oauthTokens.refreshToken ? encrypt(oauthTokens.refreshToken) : Promise.resolve(null),
	]);
	return { accessTokenEncrypted, refreshTokenEncrypted };
}

function buildCallbackResult(user: {
	email: string;
	id: number;
	role: string;
	username: string;
}): HandleCallbackResult {
	return {
		user: { email: user.email, id: user.id, role: user.role, username: user.username },
	};
}

function sanitizeUsername(name: string): string {
	const sanitized = name
		.toLowerCase()
		.replace(/[^a-zA-Z0-9_.-]/g, '-')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, USERNAME_MAX_LENGTH);
	return sanitized;
}

function generateUniqueUsername(baseName: string, db: ReturnType<typeof getDb>): string {
	const sanitized = sanitizeUsername(baseName);
	let username = sanitized || `user-${generateSecurePassword(8).toLowerCase()}`;

	if (username.length < USERNAME_MIN_LENGTH) {
		username = `user-${generateSecurePassword(8).toLowerCase()}`;
	}

	if (!USERNAME_PATTERN.test(username)) {
		username = `user-${generateSecurePassword(8).toLowerCase()}`;
	}

	const existingUser = db.select().from(users).where(eq(users.username, username)).get();
	if (!existingUser) {
		return username;
	}

	const MAX_USERNAME_SUFFIX = 999;

	// Single query to find all existing suffixed usernames in one round trip.
	// The base username is sanitized to [a-zA-Z0-9_.-] so LIKE wildcards (% _) are
	// safe as literal characters in the prefix portion (SQLite LIKE treats _ and . literally
	// unless ESCAPE is used, and % is not in the sanitized character set).
	const prefix = `${username.slice(0, USERNAME_MAX_LENGTH - 4)}-`;
	const existingSuffixed = db
		.select({ username: users.username })
		.from(users)
		.where(like(users.username, `${prefix}%`))
		.all();

	// Extract numeric suffixes from existing usernames
	const usedSuffixes = new Set<number>();
	for (const row of existingSuffixed) {
		const match = /-(\d+)$/.exec(row.username);
		if (match) {
			usedSuffixes.add(Number(match[1]));
		}
	}

	// Find the next available suffix
	for (let suffix = 2; suffix <= MAX_USERNAME_SUFFIX; suffix++) {
		if (!usedSuffixes.has(suffix)) {
			return `${username.slice(0, USERNAME_MAX_LENGTH - String(suffix).length - 1)}-${suffix}`;
		}
	}

	return `user-${generateSecurePassword(8).toLowerCase()}`;
}

type DbTransaction = Parameters<Parameters<ReturnType<typeof getDb>['transaction']>[0]>[0];
type UserRow = typeof users.$inferSelect;

function handleExistingOAuthAccount(
	tx: DbTransaction,
	existingOauth: { id: number; userId: number },
	encryptedTokens: EncryptedTokens
): UserRow {
	const found = tx.select().from(users).where(eq(users.id, existingOauth.userId)).get();
	if (!found) throw new Error('User not found for OAuth account');
	if (found.isDeleted) throw new Error('Account has been deleted');

	tx.update(oauthAccounts)
		.set({
			...encryptedTokens,
			updatedAt: new Date(),
			updatedBy: existingOauth.userId,
		})
		.where(eq(oauthAccounts.id, existingOauth.id))
		.run();

	return found;
}

function createNewOAuthUser(
	tx: DbTransaction,
	provider: OAuthProvider,
	profile: OAuthProfile,
	encryptedTokens: EncryptedTokens,
	passwordHash: string
): UserRow {
	const username = generateUniqueUsername(profile.name, tx);
	const created = tx
		.insert(users)
		.values({
			email: profile.email,
			emailVerified: TRUSTED_EMAIL_PROVIDERS.has(provider) ? profile.emailVerified : false,
			passwordHash,
			role: 'VIEWER',
			username,
		})
		.returning()
		.get();

	tx.insert(oauthAccounts)
		.values({
			...encryptedTokens,
			createdBy: created.id,
			profile: { email: profile.email, name: profile.name },
			provider,
			providerAccountId: profile.providerAccountId,
			userId: created.id,
		})
		.run();

	return created;
}

/**
 * Link OAuth account or create new user.
 * Dispatches to one of three handlers within a transaction:
 * 1. handleExistingOAuthAccount - OAuth account already linked, update tokens
 * 2. Email collision - Rejects login; user must link manually while authenticated
 * 3. createNewOAuthUser - Create user and link OAuth account
 *
 * @param provider - OAuth provider name
 * @param oauthTokens - OAuth access and refresh tokens
 * @param profile - OAuth user profile
 * @returns JWT token pair and user info
 */
async function linkAccountOrCreateUser(
	provider: OAuthProvider,
	oauthTokens: OAuthTokens,
	profile: OAuthProfile
): Promise<HandleCallbackResult> {
	const db = getDb();

	// Perform async operations before the synchronous SQLite transaction
	const [encryptedTokens, passwordHash] = await Promise.all([
		encryptOAuthTokens(oauthTokens),
		hashPassword(generateSecurePassword(48)),
	]);

	// Wrap all DB operations in a single transaction to prevent TOCTOU races.
	// The unique index on (provider, provider_account_id) provides additional safety.
	const user = db.transaction((tx) => {
		const existingOauth = tx
			.select()
			.from(oauthAccounts)
			.where(
				and(
					eq(oauthAccounts.provider, provider),
					eq(oauthAccounts.providerAccountId, profile.providerAccountId),
					eq(oauthAccounts.isDeleted, false)
				)
			)
			.get();

		if (existingOauth) {
			return handleExistingOAuthAccount(tx, existingOauth, encryptedTokens);
		}

		const existingUser = tx.select().from(users).where(eq(users.email, profile.email)).get();

		if (existingUser) {
			// Refuse auto-linking to prevent account takeover via email collision.
			// The user must log in with their existing credentials first and then
			// link the OAuth provider manually through account settings.
			throw new Error(
				'An account with this email already exists. ' +
					'Please log in with your existing credentials and link this provider from your account settings.'
			);
		}

		return createNewOAuthUser(tx, provider, profile, encryptedTokens, passwordHash);
	});

	// Keep workspace assignment outside the transaction because it performs its own
	// workspace lookups. If it fails, the user and OAuth account still exist and an
	// administrator can repair the missing membership manually.
	const alreadyInDefaultWorkspace = isMemberOfDefaultWorkspace(user.id);
	const addedToWorkspace =
		alreadyInDefaultWorkspace || addMemberToDefaultWorkspace(user.id, 'VIEWER');
	if (!addedToWorkspace) {
		logger.warn({ provider, userId: user.id }, 'Failed to add OAuth user to default workspace');
	} else if (alreadyInDefaultWorkspace) {
		logger.debug(
			{ provider, userId: user.id },
			'OAuth user already belongs to default workspace'
		);
	}

	return buildCallbackResult(user);
}

export { linkAccountOrCreateUser };
