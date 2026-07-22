import { and, eq, lt } from 'drizzle-orm';
import { createHash, createHmac, hkdfSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { OAUTH_PROVIDERS, type OAuthProvider } from 'spernakit-shared';

import type {
	OAuthAuthorizationUrlResult,
	OAuthProviderConfig,
	PKCECodePair,
} from './oauthTypes.ts';

import { getConfig } from '../../config/configLoader.ts';
import { getDb } from '../../db/index.ts';
import { pkceVerifiers } from '../../db/schema/pkceVerifiers.ts';
import { isProviderEnabled, resolveLiveProviderConfig } from './oauthProviderSettingsService.ts';

const PKCE_STORAGE_TTL_MS = 5 * 60 * 1000;

function storePKCECodeVerifier(state: string, codeVerifier: string): void {
	const db = getDb();
	const now = new Date();
	const expiresAt = new Date(now.getTime() + PKCE_STORAGE_TTL_MS);

	// Clean up expired entries before inserting
	cleanupExpiredPKCECodes(db);

	db.insert(pkceVerifiers)
		.values({ expiresAt, state, verifier: codeVerifier })
		.onConflictDoNothing()
		.run();
}

function retrieveAndConsumePKCECodeVerifier(state: string): null | string {
	const db = getDb();

	// Select and delete atomically (SQLite is single-writer)
	const row = db
		.select({ verifier: pkceVerifiers.verifier })
		.from(pkceVerifiers)
		.where(eq(pkceVerifiers.state, state))
		.get();

	if (!row) return null;

	db.delete(pkceVerifiers).where(eq(pkceVerifiers.state, state)).run();
	return row.verifier;
}

function cleanupExpiredPKCECodes(db: ReturnType<typeof getDb> = getDb()): void {
	const now = new Date();
	db.delete(pkceVerifiers).where(lt(pkceVerifiers.expiresAt, now)).run();
}

function generateCodeVerifier(): string {
	const bytes = randomBytes(32);
	return bytes.toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
	const hash = createHash('sha256').update(verifier).digest();
	return hash.toString('base64url');
}

function generatePKCECodePair(): PKCECodePair {
	const codeVerifier = generateCodeVerifier();
	const codeChallenge = generateCodeChallenge(codeVerifier);
	return { codeChallenge, codeVerifier };
}

/**
 * Generate a signed OAuth state parameter for CSRF protection.
 * State format: {randomBytes}.{timestamp}.{hmac}
 *
 * @returns Signed state string
 */
function generateOAuthState(): string {
	const random = randomBytes(16).toString('hex');
	const timestamp = Date.now().toString();
	const payload = `${random}.${timestamp}`;
	const hmac = createHmac('sha256', getOAuthStateSecret()).update(payload).digest('hex');
	return `${payload}.${hmac}`;
}

/**
 * Validate an OAuth state parameter.
 * Checks HMAC signature and timestamp freshness (5 minute window).
 *
 * @param state - State string from OAuth callback
 * @returns true if valid, false otherwise
 */
function validateOAuthState(state: string | undefined): boolean {
	if (!state) return false;

	const parts = state.split('.');
	if (parts.length !== 3) return false;

	const random = parts[0];
	const timestamp = parts[1];
	const providedHmac = parts[2];

	if (!random || !timestamp || !providedHmac) return false;

	const stateSecret = getOAuthStateSecret();
	const payload = `${random}.${timestamp}`;
	const expectedHmac = createHmac('sha256', stateSecret).update(payload).digest('hex');

	const expectedBuf = Buffer.from(expectedHmac);
	const providedBuf = Buffer.from(providedHmac);
	if (expectedBuf.length !== providedBuf.length) return false;
	if (!timingSafeEqual(providedBuf, expectedBuf)) return false;

	const stateTime = parseInt(timestamp, 10);
	const now = Date.now();
	const fiveMinutes = 5 * 60 * 1000;

	const age = now - stateTime;
	return age >= 0 && age < fiveMinutes;
}

/**
 * Get the secret used for OAuth state HMAC signing.
 * Uses oauthStateSecret if configured; otherwise derives a dedicated key
 * from cookieSecret via HKDF to maintain key isolation.
 *
 * @returns HMAC signing secret
 */
function getOAuthStateSecret(): string {
	const config = getConfig();
	if (config.security.oauthStateSecret) {
		return config.security.oauthStateSecret;
	}
	const derived = hkdfSync(
		'sha256',
		config.security.cookieSecret,
		'',
		'spernakit-oauth-state',
		32
	);
	return Buffer.from(derived).toString('hex');
}

/**
 * Get list of enabled OAuth providers.
 * Checks the settings table first (live toggles), falls back to config-based providers.
 *
 * @returns Array of enabled provider names
 */
function getEnabledProviders(): OAuthProvider[] {
	const providers: OAuthProvider[] = [];

	// Check settings table for each provider
	for (const provider of OAUTH_PROVIDERS) {
		if (isProviderEnabled(provider)) {
			providers.push(provider);
		}
	}

	// If no providers are configured in settings, fall back to config
	if (providers.length === 0) {
		const config = getConfig();
		if (config.oauth.google.enabled) providers.push('google');
		if (config.oauth.github.enabled) providers.push('github');
		if (config.oauth.microsoft.enabled) providers.push('microsoft');
	}

	return providers;
}

/**
 * Get provider config or null if not enabled.
 *
 * Delegates to resolveLiveProviderConfig (oauthProviderSettingsService.ts),
 * which reads DB-stored admin-UI settings first (decrypting the secret) and
 * falls back to file-based config when no DB row is enabled.
 *
 * @param provider - OAuth provider name
 * @returns Live provider config or null
 */
async function getProviderConfig(provider: OAuthProvider): Promise<null | OAuthProviderConfig> {
	return resolveLiveProviderConfig(provider);
}

/**
 * Generate authorization URL for a provider with PKCE support.
 *
 * @param provider - OAuth provider name
 * @param state - OAuth state parameter (optional, will be generated if not provided)
 * @returns Object with authorization URL, state, and PKCE code verifier, or null if provider is disabled
 */
async function getAuthorizationUrl(
	provider: OAuthProvider,
	state?: string
): Promise<null | OAuthAuthorizationUrlResult> {
	const providerConfig = await getProviderConfig(provider);
	if (!providerConfig) return null;

	const { callbackUrl, clientId } = providerConfig;
	const oauthState = state ?? generateOAuthState();
	const pkce = generatePKCECodePair();
	storePKCECodeVerifier(oauthState, pkce.codeVerifier);

	const commonParams = new URLSearchParams({
		client_id: clientId,
		code_challenge: pkce.codeChallenge,
		code_challenge_method: 'S256',
		redirect_uri: callbackUrl,
		state: oauthState,
	});

	switch (provider) {
		case 'github': {
			commonParams.set('scope', 'user:email');
			const url = `https://github.com/login/oauth/authorize?${commonParams.toString()}`;
			return { pkceCodeVerifier: pkce.codeVerifier, state: oauthState, url };
		}
		case 'google': {
			commonParams.set('response_type', 'code');
			commonParams.set('scope', 'openid email profile');
			const url = `https://accounts.google.com/o/oauth2/v2/auth?${commonParams.toString()}`;
			return { pkceCodeVerifier: pkce.codeVerifier, state: oauthState, url };
		}
		case 'microsoft': {
			const tenantId = providerConfig.tenantId ?? 'common';
			commonParams.set('response_type', 'code');
			commonParams.set('scope', 'openid email profile');
			const url = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize?${commonParams.toString()}`;
			return { pkceCodeVerifier: pkce.codeVerifier, state: oauthState, url };
		}
		default: {
			const _exhaustive: never = provider;
			throw new Error(`Unsupported OAuth provider: ${_exhaustive}`);
		}
	}
}

/**
 * Generate a binding hash for an OAuth state parameter.
 * Used to bind the OAuth flow to the browser session via an HttpOnly cookie.
 *
 * @param state - OAuth state parameter to hash
 * @returns Hex-encoded SHA-256 hash
 */
function generateOAuthBindingHash(state: string): string {
	return createHash('sha256').update(`oauth-bind:${state}`).digest('hex');
}

export {
	cleanupExpiredPKCECodes,
	generateOAuthBindingHash,
	generateOAuthState,
	getAuthorizationUrl,
	getOAuthStateSecret,
	getEnabledProviders,
	getProviderConfig,
	retrieveAndConsumePKCECodeVerifier,
	validateOAuthState,
};
export type { OAuthProvider };
