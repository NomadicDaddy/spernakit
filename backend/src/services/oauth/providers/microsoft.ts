import type { TokenExchangeParams, TokenExchangeResult, ProfileParseResult } from './types.ts';

import { buildTokenExchangeBody, fetchProfileData, performTokenExchange, str } from './types.ts';

const PROFILE_URL = 'https://graph.microsoft.com/v1.0/me';

function getTokenUrl(tenantId?: string): string {
	const tenant = tenantId || 'common';
	return `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`;
}

export interface MicrosoftTokenParams extends TokenExchangeParams {
	tenantId?: string;
}

export async function exchangeMicrosoftCode(
	params: MicrosoftTokenParams
): Promise<TokenExchangeResult> {
	const body = buildTokenExchangeBody(params, { scope: 'openid email profile' });
	return performTokenExchange(getTokenUrl(params.tenantId), body, 'microsoft');
}

export async function parseMicrosoftProfile(accessToken: string): Promise<ProfileParseResult> {
	const profileData = await fetchProfileData(PROFILE_URL, accessToken, 'microsoft');

	// Microsoft Graph mail field comes from Azure AD verified email.
	// userPrincipalName is a fallback but may not be a verified email address.
	const mail = str(profileData.mail);
	const email = mail || str(profileData.userPrincipalName);

	return {
		email,
		emailVerified: mail.length > 0,
		name: str(profileData.displayName),
		providerAccountId: String(profileData.id ?? ''),
	};
}
