import type { TokenExchangeParams, TokenExchangeResult, ProfileParseResult } from './types.ts';

import { fetchProfileData, OAUTH_FETCH_TIMEOUT_MS, performTokenExchange, str } from './types.ts';

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const PROFILE_URL = 'https://api.github.com/user';
const EMAILS_URL = 'https://api.github.com/user/emails';

export async function exchangeGitHubCode(
	params: TokenExchangeParams
): Promise<TokenExchangeResult> {
	const body: Record<string, string> = {
		client_id: params.clientId,
		client_secret: params.clientSecret,
		code: params.code,
		code_verifier: params.codeVerifier,
		redirect_uri: params.callbackUrl,
	};

	return performTokenExchange(TOKEN_URL, body, 'github');
}

export async function parseGitHubProfile(accessToken: string): Promise<ProfileParseResult> {
	const [profileData, emailResult] = await Promise.all([
		fetchProfileData(PROFILE_URL, accessToken, 'github'),
		fetchGitHubPrimaryEmail(accessToken),
	]);

	// Use the emails endpoint result as source of truth for both email and verification.
	// Fall back to profile-level email if the emails endpoint returned nothing.
	const email = emailResult.email || str(profileData.email);
	const emailVerified = emailResult.email === email ? emailResult.verified : false;

	return {
		email,
		emailVerified,
		name: str(profileData.name) || str(profileData.login),
		providerAccountId: String(profileData.id ?? ''),
	};
}

interface GitHubEmailEntry {
	email: unknown;
	primary: unknown;
	verified: unknown;
}

function isGitHubEmailEntry(value: unknown): value is GitHubEmailEntry {
	return (
		typeof value === 'object' &&
		value !== null &&
		'email' in value &&
		'primary' in value &&
		'verified' in value
	);
}

interface GitHubEmailResult {
	email: string;
	verified: boolean;
}

async function fetchGitHubPrimaryEmail(accessToken: string): Promise<GitHubEmailResult> {
	let response: Response;
	try {
		response = await fetch(EMAILS_URL, {
			headers: { Authorization: `Bearer ${accessToken}` },
			signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS),
		});
	} catch {
		// Timeout or network failure — emails endpoint is best-effort, fall back to profile email
		return { email: '', verified: false };
	}

	if (!response.ok) {
		return { email: '', verified: false };
	}

	const emailsRaw: unknown = await response.json();
	if (!Array.isArray(emailsRaw)) {
		return { email: '', verified: false };
	}

	const emails = emailsRaw.filter(isGitHubEmailEntry);
	const primary = emails.find((e) => e.primary === true && typeof e.email === 'string');
	if (primary && typeof primary.email === 'string') {
		return { email: primary.email, verified: primary.verified === true };
	}
	const first = emails[0];
	if (first && typeof first.email === 'string') {
		return { email: first.email, verified: first.verified === true };
	}
	return { email: '', verified: false };
}
