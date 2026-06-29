import type {
	HandleCallbackResult,
	OAuthProfile,
	OAuthProvider,
	OAuthProviderConfig,
	OAuthTokens,
} from './oauthTypes.ts';
import type {
	TokenExchangeParams,
	TokenExchangeResult,
	ProfileParseResult,
} from './providers/types.ts';

import { linkAccountOrCreateUser } from './oauthAccountService.ts';
import { retrieveAndConsumePKCECodeVerifier, validateOAuthState } from './oauthProviderService.ts';
import { resolveLiveProviderConfig } from './oauthProviderSettingsService.ts';
import { exchangeGitHubCode, parseGitHubProfile } from './providers/github.ts';
import { exchangeGoogleCode, parseGoogleProfile } from './providers/google.ts';
import { exchangeMicrosoftCode, parseMicrosoftProfile } from './providers/microsoft.ts';

type TokenExchangeFn = (params: TokenExchangeParams) => Promise<TokenExchangeResult>;
type ProfileParseFn = (accessToken: string) => Promise<ProfileParseResult>;

function getProviderExchange(provider: OAuthProvider): TokenExchangeFn {
	switch (provider) {
		case 'github':
			return exchangeGitHubCode;
		case 'google':
			return exchangeGoogleCode;
		case 'microsoft':
			return exchangeMicrosoftCode;
		default: {
			const _exhaustive: never = provider;
			throw new Error(`Unsupported OAuth provider: ${_exhaustive}`);
		}
	}
}

function getProviderProfileParser(provider: OAuthProvider): ProfileParseFn {
	switch (provider) {
		case 'github':
			return parseGitHubProfile;
		case 'google':
			return parseGoogleProfile;
		case 'microsoft':
			return parseMicrosoftProfile;
		default: {
			const _exhaustive: never = provider;
			throw new Error(`Unsupported OAuth provider: ${_exhaustive}`);
		}
	}
}

function buildTokenParams(
	providerConfig: OAuthProviderConfig,
	code: string,
	codeVerifier: string
): TokenExchangeParams {
	return {
		callbackUrl: providerConfig.callbackUrl,
		clientId: providerConfig.clientId,
		clientSecret: providerConfig.clientSecret,
		code,
		codeVerifier,
	};
}

async function exchangeCode(
	provider: OAuthProvider,
	code: string,
	codeVerifier?: string
): Promise<OAuthTokens> {
	if (!codeVerifier) {
		throw new Error('PKCE code verifier is required for token exchange');
	}

	const providerConfig = await resolveLiveProviderConfig(provider);
	if (!providerConfig) throw new Error(`Provider ${provider} is not configured`);

	const exchangeFn = getProviderExchange(provider);
	let params: TokenExchangeParams & { tenantId?: string | undefined } = buildTokenParams(
		providerConfig,
		code,
		codeVerifier
	);

	if (provider === 'microsoft') {
		params = { ...params, tenantId: providerConfig.tenantId };
	}

	const result = await exchangeFn(params);

	return {
		accessToken: result.accessToken,
		refreshToken: result.refreshToken,
	};
}

async function fetchProfile(provider: OAuthProvider, accessToken: string): Promise<OAuthProfile> {
	const parseFn = getProviderProfileParser(provider);
	const result = await parseFn(accessToken);

	return {
		email: result.email,
		emailVerified: result.emailVerified,
		name: result.name,
		providerAccountId: result.providerAccountId,
	};
}

async function handleCallback(
	provider: OAuthProvider,
	code: string,
	state: string | undefined
): Promise<HandleCallbackResult> {
	if (!validateOAuthState(state)) {
		throw new Error('Invalid or expired OAuth state parameter');
	}

	const codeVerifier = retrieveAndConsumePKCECodeVerifier(state ?? '');
	if (!codeVerifier) {
		throw new Error('Invalid or expired PKCE code verifier');
	}

	const oauthTokens = await exchangeCode(provider, code, codeVerifier);
	const profile = await fetchProfile(provider, oauthTokens.accessToken);

	const result = await linkAccountOrCreateUser(provider, oauthTokens, profile);

	return result;
}

export { handleCallback };
export type { OAuthProfile, OAuthProvider, OAuthTokens };
