export interface TokenExchangeParams {
	callbackUrl: string;
	clientId: string;
	clientSecret: string;
	code: string;
	codeVerifier: string;
}

export interface TokenExchangeResult {
	accessToken: string;
	refreshToken?: string | undefined;
}

export interface ProfileParseResult {
	email: string;
	emailVerified: boolean;
	name: string;
	providerAccountId: string;
}

/** Timeout for outbound OAuth provider requests (token exchange, profile fetch). */
export const OAUTH_FETCH_TIMEOUT_MS = 10_000;

/**
 * Fetch with a timeout, converting AbortError/TimeoutError into a clean Error
 * so a hung provider endpoint fails like any other provider error.
 * @param url - Provider endpoint URL.
 * @param init - Fetch options (method, headers, body).
 * @param provider - Provider name for the error message.
 * @param operation - Operation label for the error message (e.g. 'token exchange').
 * @returns The fetch Response on success.
 */
async function oauthFetch(
	url: string,
	init: RequestInit,
	provider: string,
	operation: string
): Promise<Response> {
	try {
		return await fetch(url, { ...init, signal: AbortSignal.timeout(OAUTH_FETCH_TIMEOUT_MS) });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		throw new Error(`OAuth ${operation} request failed for ${provider}: ${message}`, {
			cause: err,
		});
	}
}

export async function performTokenExchange(
	tokenUrl: string,
	body: Record<string, string>,
	provider: string
): Promise<TokenExchangeResult> {
	const response = await oauthFetch(
		tokenUrl,
		{
			body: new URLSearchParams(body).toString(),
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			method: 'POST',
		},
		provider,
		'token exchange'
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`OAuth token exchange failed for ${provider}: ${response.status} ${errorText}`
		);
	}

	const data: unknown = await response.json();
	if (!data || typeof data !== 'object') {
		throw new Error(`OAuth token exchange returned non-object response for ${provider}`);
	}
	const record = data as Record<string, unknown>;
	if (typeof record.access_token !== 'string' || !record.access_token) {
		throw new Error(`OAuth token exchange returned no access_token for ${provider}`);
	}

	return {
		accessToken: record.access_token,
		refreshToken: typeof record.refresh_token === 'string' ? record.refresh_token : undefined,
	};
}

export async function fetchProfileData(
	profileUrl: string,
	accessToken: string,
	provider: string
): Promise<Record<string, unknown>> {
	const response = await oauthFetch(
		profileUrl,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
		provider,
		'profile fetch'
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`OAuth profile fetch failed for ${provider}: ${response.status} ${errorText}`
		);
	}

	const raw: unknown = await response.json();
	if (!raw || typeof raw !== 'object') {
		throw new Error(`OAuth profile fetch returned non-object response for ${provider}`);
	}
	return raw as Record<string, unknown>;
}

function str(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

function buildTokenExchangeBody(
	params: TokenExchangeParams,
	extra?: Record<string, string>
): Record<string, string> {
	return {
		client_id: params.clientId,
		client_secret: params.clientSecret,
		code: params.code,
		code_verifier: params.codeVerifier,
		grant_type: 'authorization_code',
		redirect_uri: params.callbackUrl,
		...extra,
	};
}

export { buildTokenExchangeBody, str };
