import type { TokenExchangeParams, TokenExchangeResult, ProfileParseResult } from './types.ts';

import { buildTokenExchangeBody, fetchProfileData, performTokenExchange, str } from './types.ts';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const PROFILE_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';

export async function exchangeGoogleCode(
	params: TokenExchangeParams
): Promise<TokenExchangeResult> {
	return performTokenExchange(TOKEN_URL, buildTokenExchangeBody(params), 'google');
}

export async function parseGoogleProfile(accessToken: string): Promise<ProfileParseResult> {
	const profileData = await fetchProfileData(PROFILE_URL, accessToken, 'google');

	return {
		email: str(profileData.email),
		emailVerified: profileData.verified_email === true,
		name: str(profileData.name),
		providerAccountId: String(profileData.id ?? ''),
	};
}
