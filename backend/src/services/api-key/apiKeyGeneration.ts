import { createHash, randomBytes } from 'node:crypto';

import type { ApiKeyScope } from '../../types/apiKeys.ts';

import { getDb } from '../../db/index.ts';
import { apiKeys } from '../../db/schema/apiKeys.ts';
import { encrypt } from '../../utils/encryption.ts';

/** API key data for display and general operations (excludes sensitive fields). */
interface ApiKeyInfo {
	createdAt: Date;
	createdBy: number;
	expiresAt: Date | null;
	id: number;
	isActive: boolean;
	keyHash: string;
	keyName: string;
	keyScope: ApiKeyScope;
	lastUsedAt: Date | null;
}

/** Extended API key data that includes the encrypted secret for validation operations. */
interface ApiKeyValidationData extends ApiKeyInfo {
	keySecret: null | string;
}

interface CreateApiKeyInput {
	createdBy: number;
	expiresAt?: Date | null;
	keyName: string;
	keyScope: ApiKeyScope;
}

/**
 * Generate a random API key (32 bytes hex-encoded).
 *
 * @returns Random API key string
 */
function generateApiKeyString(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Hash an API key using Bun.password (bcrypt algorithm).
 *
 * @param apiKey - Plain API key to hash
 * @returns Bcrypt hash string
 */
async function hashApiKey(apiKey: string): Promise<string> {
	return Bun.password.hash(apiKey, { algorithm: 'bcrypt', cost: 12 });
}

/**
 * Generate SHA-256 hash for fast index lookup (timing-safe).
 * This hash is used for O(1) database lookup to prevent timing attacks.
 *
 * @param apiKey - Plain API key to hash
 * @returns Hex-encoded SHA-256 hash
 */
function generateKeyIndexHash(apiKey: string): string {
	return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Verify an API key against a bcrypt hash using timing-safe comparison.
 *
 * @param apiKey - Plain API key to verify
 * @param hash - Bcrypt hash to compare against
 * @returns True if the API key matches the hash
 */
async function verifyApiKey(apiKey: string, hash: string): Promise<boolean> {
	return Bun.password.verify(apiKey, hash);
}

/**
 * Generate a new API key for a user.
 *
 * @param input - API key creation parameters
 * @returns Object containing plain API key (only shown once) and stored key data
 */
async function generateApiKey(input: CreateApiKeyInput): Promise<{
	apiKey: string;
	apiKeySecret: string;
	keyData: ApiKeyInfo;
}> {
	const db = getDb();
	const plainApiKey = generateApiKeyString();
	const keySecret = generateApiKeyString();
	const keyIndexHash = generateKeyIndexHash(plainApiKey);
	const [keyHash, encryptedSecret] = await Promise.all([
		hashApiKey(plainApiKey),
		encrypt(keySecret),
	]);
	const now = new Date();

	const result = db
		.insert(apiKeys)
		.values({
			createdAt: now,
			createdBy: input.createdBy,
			expiresAt: input.expiresAt ?? null,
			isActive: true,
			keyHash,
			keyIndexHash,
			keyName: input.keyName,
			keyScope: input.keyScope,
			keySecret: encryptedSecret,
			updatedAt: now,
		})
		.returning()
		.get();

	const { keySecret: _omitSecret, ...keyInfo } = result as ApiKeyValidationData;
	return {
		apiKey: plainApiKey,
		apiKeySecret: keySecret,
		keyData: keyInfo as ApiKeyInfo,
	};
}

export { generateApiKey, generateKeyIndexHash, verifyApiKey };
export type { ApiKeyInfo, ApiKeyValidationData, CreateApiKeyInput };
