import type { OAuthProvider } from 'spernakit-shared';

interface OAuthProviderConfig {
	callbackUrl: string;
	clientId: string;
	clientSecret: string;
	enabled: boolean;
	tenantId?: string;
}

interface OAuthProfile {
	email: string;
	emailVerified: boolean;
	name: string;
	providerAccountId: string;
}

interface OAuthTokens {
	accessToken: string;
	refreshToken?: string | undefined;
}

interface PKCECodePair {
	codeChallenge: string;
	codeVerifier: string;
}

interface OAuthAuthorizationUrlResult {
	pkceCodeVerifier: string;
	state: string;
	url: string;
}

interface HandleCallbackResult {
	user: { email: string; id: number; role: string; username: string };
}

export type {
	HandleCallbackResult,
	OAuthAuthorizationUrlResult,
	OAuthProfile,
	OAuthProvider,
	OAuthProviderConfig,
	OAuthTokens,
	PKCECodePair,
};
