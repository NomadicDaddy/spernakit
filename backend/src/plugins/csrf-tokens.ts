import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

import { getConfig } from '../config/configLoader.ts';

/**
 * Generate a per-user CSRF signing secret (64 hex characters / 32 bytes).
 *
 * @returns Hex-encoded random secret
 */
function generateCsrfSecret(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Derive a session-unique CSRF token from a user's signing secret.
 * Format: `<timestamp_hex>.<nonce_hex>.<hmac_hex>`
 * - timestamp enables expiration checking without extra storage
 * - nonce ensures uniqueness per generation
 * - HMAC binds the token to the user's secret
 *
 * @param secret - Per-user CSRF signing secret
 * @returns Signed CSRF token
 */
function deriveCsrfToken(secret: string): string {
	const timestamp = Date.now().toString(16);
	const nonce = randomBytes(16).toString('hex');
	const payload = `${timestamp}.${nonce}`;
	const hmac = createHmac('sha256', secret).update(payload).digest('hex');
	return `${payload}.${hmac}`;
}

/**
 * Extract creation timestamp from a CSRF token.
 * Returns null if the token format is invalid.
 *
 * @param token - CSRF token string
 * @returns Creation timestamp in milliseconds, or null
 */
function extractCsrfTimestamp(token: string): null | number {
	const dotIndex = token.indexOf('.');
	if (dotIndex <= 0) return null;
	const hexTimestamp = token.substring(0, dotIndex);
	const timestamp = parseInt(hexTimestamp, 16);
	return isNaN(timestamp) ? null : timestamp;
}

/**
 * Validate a CSRF token against the user's stored signing secret.
 * Recomputes the HMAC from the token's payload and compares using timing-safe comparison.
 *
 * @param providedToken - CSRF token from request header
 * @param storedSecret - Per-user CSRF signing secret from database
 * @returns true if signature is valid
 */
function verifyCsrfSignature(providedToken: string, storedSecret: string): boolean {
	const parts = providedToken.split('.');
	if (parts.length !== 3) return false;

	const [timestamp, nonce, providedHmac] = parts;
	if (!timestamp || !nonce || !providedHmac) return false;

	const payload = `${timestamp}.${nonce}`;
	const expectedHmac = createHmac('sha256', storedSecret).update(payload).digest('hex');

	const expectedBuf = Buffer.from(expectedHmac);
	const providedBuf = Buffer.from(providedHmac);
	if (expectedBuf.length !== providedBuf.length) return false;

	return timingSafeEqual(providedBuf, expectedBuf);
}

function isCsrfTokenExpired(token: string): boolean {
	const config = getConfig();
	const ttlMs = config.security.csrfTokenTtlMs;
	const createdAt = extractCsrfTimestamp(token);
	return createdAt !== null && Date.now() - createdAt > ttlMs;
}

export { deriveCsrfToken, generateCsrfSecret, isCsrfTokenExpired, verifyCsrfSignature };
