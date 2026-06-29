import { createHmac, timingSafeEqual } from 'node:crypto';

import { getDb } from '../db/index.ts';
import { apiKeyNonces } from '../db/schema/apiKeyNonces.ts';
import { isRawUniqueViolation } from '../utils/errorResponse.ts';

interface SignatureValidationInput {
	body: string;
	method: string;
	nonce: string;
	path: string;
	signature: string;
	timestamp: number;
}

/** Maximum age for API key signature timestamps (5 minutes). */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Generate HMAC signature for API key request.
 *
 * @param timestamp - Unix timestamp in seconds
 * @param method - HTTP method
 * @param path - Request path
 * @param body - Request body (empty string for GET)
 * @param keySecret - API key secret
 * @returns Hex-encoded HMAC-SHA256 signature
 */
function generateApiKeySignature(
	timestamp: number,
	method: string,
	path: string,
	body: string,
	keySecret: string
): string {
	// Newline delimiters prevent ambiguous concatenations (e.g., timestamp
	// digits bleeding into the method). Payload = timestamp\nmethod\npath\nbody.
	const payload = `${timestamp}\n${method}\n${path}\n${body}`;
	return createHmac('sha256', keySecret).update(payload).digest('hex');
}

/**
 * Validate an HMAC signature against the expected value using timing-safe comparison.
 * Also checks timestamp freshness and nonce uniqueness.
 *
 * @param input - Signature validation input
 * @param keySecret - The key's secret for HMAC computation
 * @returns True if signature is valid and nonce is fresh
 */
function validateSignature(input: SignatureValidationInput, keySecret: string): boolean {
	const timestampMs = input.timestamp * 1000;
	if (!Number.isFinite(timestampMs)) return false;

	const timestampAge = Date.now() - timestampMs;
	if (Math.abs(timestampAge) > MAX_TIMESTAMP_AGE_MS) return false;

	const expected = generateApiKeySignature(
		input.timestamp,
		input.method,
		input.path,
		input.body,
		keySecret
	);
	const expectedBuf = Buffer.from(expected);
	const signatureBuf = Buffer.from(input.signature);
	if (expectedBuf.length !== signatureBuf.length) return false;
	if (!timingSafeEqual(expectedBuf, signatureBuf)) return false;

	const db = getDb();
	const nonceExpiry = new Date(timestampMs + MAX_TIMESTAMP_AGE_MS);
	try {
		db.insert(apiKeyNonces)
			.values({
				createdAt: new Date(timestampMs),
				expiresAt: nonceExpiry,
				nonce: input.nonce,
			})
			.run();
	} catch (err: unknown) {
		if (isRawUniqueViolation(err)) return false;
		throw err;
	}

	return true;
}

export { validateSignature };
