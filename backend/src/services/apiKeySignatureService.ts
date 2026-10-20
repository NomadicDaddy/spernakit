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
	/** Scheme version from the x-api-version header; only 2 is accepted. */
	version: number;
}

/** Maximum age for API key signature timestamps (5 minutes). */
const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000;

/**
 * Generate the v2 HMAC signature for an API key request (timestamp\nnonce\nmethod\npath\nbody).
 *
 * @param timestamp - Unix timestamp in seconds
 * @param nonce - Single-use nonce, part of the signed payload
 * @param method - HTTP method
 * @param path - Request path
 * @param body - Request body (empty string for GET)
 * @param keySecret - API key secret
 * @returns Hex-encoded HMAC-SHA256 signature
 */
/**
 * The request-signing scheme version this build verifies.
 *
 * v1 signed `timestamp\nmethod\npath\nbody` - the nonce was stored single-use but NOT signed,
 * so one captured signature could be replayed with any number of fresh nonces for the whole
 * timestamp window (the 2026-10-20 SECURITY audit High; fixed in v3.47.6). v2 signs
 * `timestamp\nnonce\nmethod\npath\nbody`, binding the single-use nonce to the signature so a
 * replay with a different nonce fails the HMAC comparison and a replay with the same nonce
 * fails the uniqueness insert. v1 is rejected outright, with no acceptance window: the
 * repository and every derived app ship no client-side signer (the only payload constructor
 * is this service's own expected-value computation), so there is nothing to grandfather.
 */
const SIGNATURE_VERSION = 2;

function generateApiKeySignature(
	timestamp: number,
	nonce: string,
	method: string,
	path: string,
	body: string,
	keySecret: string,
): string {
	// Newline delimiters prevent ambiguous concatenations (e.g., timestamp
	// digits bleeding into the method). Payload = timestamp\nnonce\nmethod\npath\nbody; the
	// nonce is SIGNED so a captured signature cannot be replayed under a fresh nonce.
	const payload = `${timestamp}\n${nonce}\n${method}\n${path}\n${body}`;
	return createHmac('sha256', keySecret).update(payload).digest('hex');
}

/**
 * Record a single-use nonce. Returns false when the nonce already exists (a replay); any
 * other failure propagates. Split from validateSignature to keep both under the
 * complexity ratchet.
 *
 * @param nonce - Single-use nonce to record
 * @param timestampMs - Request timestamp in milliseconds; sets createdAt and expiry
 * @returns True when the nonce was fresh and recorded, false on a unique violation
 */
function recordSingleUseNonce(nonce: string, timestampMs: number): boolean {
	const nonceExpiry = new Date(timestampMs + MAX_TIMESTAMP_AGE_MS);
	try {
		getDb()
			.insert(apiKeyNonces)
			.values({
				createdAt: new Date(timestampMs),
				expiresAt: nonceExpiry,
				nonce,
			})
			.run();
	} catch (err: unknown) {
		if (isRawUniqueViolation(err)) return false;
		throw err;
	}
	return true;
}

/**
 * Validate an HMAC signature against the expected value using timing-safe comparison.
 * Also checks timestamp freshness, scheme version, and nonce uniqueness.
 *
 * @param input - Signature validation input (version from the x-api-version header)
 * @param keySecret - The key's secret for HMAC computation
 * @returns True if signature is valid, the scheme is v2, and the nonce is fresh
 */
function validateSignature(input: SignatureValidationInput, keySecret: string): boolean {
	if (input.version !== SIGNATURE_VERSION) return false;

	const timestampMs = input.timestamp * 1000;
	if (!Number.isFinite(timestampMs)) return false;

	const timestampAge = Date.now() - timestampMs;
	if (Math.abs(timestampAge) > MAX_TIMESTAMP_AGE_MS) return false;

	const expected = generateApiKeySignature(
		input.timestamp,
		input.nonce,
		input.method,
		input.path,
		input.body,
		keySecret,
	);
	const expectedBuf = Buffer.from(expected);
	const signatureBuf = Buffer.from(input.signature);
	if (expectedBuf.length !== signatureBuf.length) return false;
	if (!timingSafeEqual(expectedBuf, signatureBuf)) return false;

	return recordSingleUseNonce(input.nonce, timestampMs);
}

export { validateSignature };
