import { and, eq, lt } from 'drizzle-orm';

import type { ApiKeyScope } from '../../types/apiKeys.ts';
import type { UserRole } from '../../types/roles.ts';
import type { ApiKeyValidationData } from './apiKeyGeneration.ts';

import { getConfig } from '../../config/configLoader.ts';
import { getDb } from '../../db/index.ts';
import { apiKeyNonces } from '../../db/schema/apiKeyNonces.ts';
import { apiKeys } from '../../db/schema/apiKeys.ts';
import { users } from '../../db/schema/users.ts';
import { validateUserRole } from '../../types/roles.ts';
import { decrypt } from '../../utils/encryption.ts';
import { validateSignature } from '../apiKeySignatureService.ts';
import { generateKeyIndexHash, verifyApiKey } from './apiKeyGeneration.ts';

interface ValidateApiKeyInput {
	apiKey: string;
	body: string;
	method: string;
	nonce: string;
	path: string;
	signature: string;
	timestamp: number;
	/** Scheme version from the x-api-version header; only 2 is accepted. */
	version: number;
}

interface ApiKeyListItem {
	createdAt: Date;
	createdBy: number;
	expiresAt: Date | null;
	id: number;
	isActive: boolean;
	keyName: string;
	keyScope: ApiKeyScope;
	lastUsedAt: Date | null;
}

interface ListApiKeysInput {
	userId: number;
}

interface HasActiveApiKeyWithNameInput {
	keyName: string;
	userId: number;
}

/**
 * Record that an API key was used (updates lastUsedAt).
 * @param keyId
 */
function recordApiKeyUsage(keyId: number): void {
	const db = getDb();
	const now = new Date();
	db.update(apiKeys).set({ lastUsedAt: now, updatedAt: now }).where(eq(apiKeys.id, keyId)).run();
	db.delete(apiKeyNonces).where(lt(apiKeyNonces.expiresAt, new Date())).run();
}

/** Validated API key data enriched with the owner's current role. */
type ValidatedApiKey = { ownerRole: UserRole } & ApiKeyValidationData;

/** The api_keys row shape validateApiKey reads, without Drizzle's table metadata. */
type ApiKeyCandidate = ApiKeyValidationData;

/**
 * Look up the active key row for a plain API key and verify its bcrypt hash.
 *
 * Split from validateApiKey to keep both under the function-size ratchet. Every null return here is
 * a reason a request cannot even reach signature validation: unknown key, wrong key, expired key.
 *
 * @param plainApiKey - The key exactly as the caller sent it
 * @returns The stored row when the key is known, matching and unexpired; null otherwise
 */
async function findActiveApiKey(plainApiKey: string): Promise<ApiKeyCandidate | null> {
	const keyIndexHash = generateKeyIndexHash(plainApiKey);

	const candidate = getDb()
		.select()
		.from(apiKeys)
		.where(and(eq(apiKeys.keyIndexHash, keyIndexHash), eq(apiKeys.isActive, true)))
		.get();
	if (!candidate) return null;

	const matches = await verifyApiKey(plainApiKey, candidate.keyHash);
	if (!matches) return null;

	if (candidate.expiresAt && candidate.expiresAt < new Date()) return null;

	return candidate as ApiKeyCandidate;
}

/**
 * The key owner as validation needs them: present, not soft-deleted, not currently locked out,
 * carrying their CURRENT role so the auth layer can cap the key's effective role at the owner's
 * present privilege level (a key can never out-rank its owner).
 *
 * @param ownerId - The api_keys.createdBy to read
 * @returns The owner's current role, or null when that owner must not authenticate
 */
function findEligibleOwnerRole(ownerId: number): null | UserRole {
	const owner = getDb()
		.select({ isDeleted: users.isDeleted, lockedUntil: users.lockedUntil, role: users.role })
		.from(users)
		.where(eq(users.id, ownerId))
		.get();
	if (!owner || owner.isDeleted) return null;
	if (owner.lockedUntil && owner.lockedUntil > new Date()) return null;
	return validateUserRole(owner.role);
}

/**
 * Validate a signed API-key request and return key data if valid.
 * Checks key hash, active status, expiration, owner state (deleted/locked), and the HMAC
 * signature over the request (mandatory since the 2026-10-20 SECURITY audit High: the plain
 * string-input path that authenticated a key without any signature is gone).
 *
 * @param input - Full validation parameters, including the signature material
 * @returns API key data (with owner's current role) or null if invalid
 */
async function validateApiKey(input: ValidateApiKeyInput): Promise<null | ValidatedApiKey> {
	const candidate = await findActiveApiKey(input.apiKey);
	if (!candidate) return null;

	const ownerRole = findEligibleOwnerRole(candidate.createdBy);
	if (!ownerRole) return null;

	// A stored secret is required: a key minted without one has nothing to verify the HMAC
	// against, so it can never satisfy mandatory signing.
	if (!candidate.keySecret) return null;
	const decryptedSecret = await decrypt(candidate.keySecret);
	if (!validateSignature(input, decryptedSecret)) return null;

	recordApiKeyUsage(candidate.id);
	return { ...candidate, ownerRole };
}

/**
 * Revoke (deactivate) an API key.
 *
 * @param keyId - ID of API key to revoke
 * @param userId
 * @returns True if the key was revoked, false if not found
 */
async function revokeApiKey(keyId: number, userId: number): Promise<boolean> {
	const db = getDb();
	const now = new Date();

	const existing = db
		.select({ id: apiKeys.id })
		.from(apiKeys)
		.where(and(eq(apiKeys.id, keyId), eq(apiKeys.createdBy, userId)))
		.get();

	if (!existing) return false;

	db.update(apiKeys).set({ isActive: false, updatedAt: now }).where(eq(apiKeys.id, keyId)).run();

	return true;
}

/**
 * Check whether the user already has an active API key with the given name.
 * Used by the create-API-key route to enforce the (createdBy, keyName, isActive)
 * uniqueness contract before invoking generateApiKey.
 *
 * @param input - User id and candidate key name
 * @returns True if an active key with that name already exists for the user
 */
async function hasActiveApiKeyWithName(input: HasActiveApiKeyWithNameInput): Promise<boolean> {
	const db = getDb();
	const existing = db
		.select({ id: apiKeys.id })
		.from(apiKeys)
		.where(
			and(
				eq(apiKeys.createdBy, input.userId),
				eq(apiKeys.keyName, input.keyName),
				eq(apiKeys.isActive, true),
			),
		)
		.get();
	return Boolean(existing);
}

/**
 * List API keys for a user.
 *
 * @param input - List parameters
 * @returns Array of API keys (without the hash or secret)
 */
async function listApiKeys(input: ListApiKeysInput): Promise<ApiKeyListItem[]> {
	const db = getDb();
	const maxPerUser = getConfig().apiKeys.maxPerUser;

	const keys = db
		.select({
			createdAt: apiKeys.createdAt,
			createdBy: apiKeys.createdBy,
			expiresAt: apiKeys.expiresAt,
			id: apiKeys.id,
			isActive: apiKeys.isActive,
			keyName: apiKeys.keyName,
			keyScope: apiKeys.keyScope,
			lastUsedAt: apiKeys.lastUsedAt,
		})
		.from(apiKeys)
		.where(eq(apiKeys.createdBy, input.userId))
		.orderBy(apiKeys.createdAt)
		.limit(maxPerUser)
		.all();

	return keys as ApiKeyListItem[];
}

/**
 * Count active API keys belonging to a user. Used to enforce the per-user cap
 * on creation so the read-side bound (listApiKeys.limit) is guaranteed by the
 * write path as well.
 *
 * @param userId
 * @returns Number of active keys for the user
 */
function countActiveApiKeysForUser(userId: number): number {
	const db = getDb();
	const rows = db
		.select({ id: apiKeys.id })
		.from(apiKeys)
		.where(and(eq(apiKeys.createdBy, userId), eq(apiKeys.isActive, true)))
		.all();
	return rows.length;
}

export {
	countActiveApiKeysForUser,
	hasActiveApiKeyWithName,
	listApiKeys,
	revokeApiKey,
	validateApiKey,
};
export type { ApiKeyListItem, ValidateApiKeyInput, ValidatedApiKey };
