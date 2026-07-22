import type { OAuthProvider } from 'spernakit-shared';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { signTokenPair } from '../../plugins/auth.ts';
import { isRateLimitBypassed } from '../../plugins/rateLimit/index.ts';
import {
	getMfaStatus,
	issueMfaChallengeToken,
	recordSuccessfulLogin,
} from '../../services/authService.ts';
import { getAuthorizationUrl, handleCallback } from '../../services/oauthService.ts';
import { validateUserRole } from '../../types/roles.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { storeRefreshTokenHash } from '../../utils/auth/authHelpers.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import {
	AUTH_ERROR_CODES,
	badRequestError,
	type ErrorResponse,
	notFoundError,
	RATE_ERROR_CODES,
	rateLimitError,
	RESOURCE_ERROR_CODES,
	serviceUnavailableError,
} from '../../utils/errorResponse.ts';
import { logger } from '../../utils/logger.ts';
import {
	buildOAuthBindCookie,
	buildOAuthLoginCookies,
	checkOAuthCallbackRateLimit,
	generateAndStoreCsrfToken,
	validateAccountStatus,
	validateOAuthQuery,
	validateSessionBinding,
} from './oauth-helpers.ts';

/* -------------------------------------------------------------------------- */
/*  Extracted handler: OAuth callback                                         */
/* -------------------------------------------------------------------------- */

/** Exchange OAuth code for tokens, validate the account, set login cookies, and determine redirect. */
async function processOAuthCallbackResult(
	provider: OAuthProvider,
	code: string,
	state: string,
	request: Request,
	set: { headers: Record<string, number | string>; redirect?: string; status?: number | string }
): Promise<ErrorResponse | undefined> {
	const result = await handleCallback(provider, code, state);

	// Verify account is eligible for login
	const accountResult = validateAccountStatus(result.user.id, provider);
	if (accountResult.error) {
		set.status = accountResult.error.status;
		return accountResult.error.body;
	}

	const dbUser = accountResult.user;
	const mfaStatus = getMfaStatus(result.user.id);
	if (mfaStatus?.isEnabled) {
		const mfaToken = issueMfaChallengeToken(result.user.id);
		if (mfaToken === null) {
			logger.error(
				{ provider, userId: result.user.id },
				'OAuth MFA login blocked because challenge signing is unavailable'
			);
			set.status = HTTP_STATUS.SERVICE_UNAVAILABLE;
			return serviceUnavailableError(
				'MFA is not configured on this server. Contact an administrator.',
				AUTH_ERROR_CODES.AUTH_MFA_NOT_CONFIGURED
			);
		}

		// Pass the challenge token in the URL FRAGMENT — fragments are never sent
		// to servers, so the token stays out of access logs and history sync.
		set.redirect = `/mfa-verify#mfaToken=${encodeURIComponent(mfaToken)}`;
		return undefined;
	}

	const tokens = signTokenPair({
		id: result.user.id,
		role: validateUserRole(result.user.role),
	});
	const loginIp = getClientIp(request);
	recordSuccessfulLogin(result.user.id, loginIp);

	storeRefreshTokenHash(result.user.id, tokens.refreshToken);
	const csrfToken = await generateAndStoreCsrfToken(result.user.id);

	// Elysia runtime correctly handles string[] for set-cookie despite Record<string, string> typing
	(set.headers as Record<string, string | string[]>)['set-cookie'] = buildOAuthLoginCookies(
		tokens,
		csrfToken,
		request
	);

	// Redirect to password change if required
	set.redirect = dbUser.requiresPasswordChange ? '/profile?tab=password' : '/dashboard';
	return undefined;
}

/** Handle GET /oauth/:provider/callback — exchange code for tokens and set cookies. */
async function handleOAuthCallback({
	params,
	query,
	request,
	set,
}: {
	params: { provider: OAuthProvider };
	query: { code?: string; error?: string; state?: string };
	request: Request;
	set: { headers: Record<string, number | string>; redirect?: string; status?: number | string };
}) {
	const provider = params.provider;

	// Rate limit check
	if (!isRateLimitBypassed()) {
		const ip = getClientIp(request);
		const ipResult = checkOAuthCallbackRateLimit(ip);
		if (ipResult.limited) {
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			set.headers['Retry-After'] = String(ipResult.retryAfter ?? 0);
			return rateLimitError(
				ipResult.retryAfter ?? 0,
				RATE_ERROR_CODES.RATE_OAUTH_CALLBACK_LIMIT_EXCEEDED
			);
		}
	}

	// Validate query parameters (code required, reject provider errors)
	const validated = validateOAuthQuery(query, provider);
	if (!validated.ok) {
		set.status = validated.status;
		return validated.body;
	}

	const { code, state } = validated;

	// Reject callbacks without state — state is required for CSRF protection
	if (!state) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Missing OAuth state parameter', AUTH_ERROR_CODES.AUTH_OAUTH_FAILED);
	}

	// Validate session binding cookie matches state
	const bindingError = validateSessionBinding(state, request, provider);
	if (bindingError) {
		set.status = bindingError.status;
		return bindingError.body;
	}

	try {
		return await processOAuthCallbackResult(provider, code, state, request, set);
	} catch (err) {
		logger.error({ error: err, provider }, 'OAuth callback failed');
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('OAuth authentication failed', AUTH_ERROR_CODES.AUTH_OAUTH_FAILED);
	}
}

/** Handle GET /oauth/:provider — initiate OAuth flow with session binding cookie. */
async function handleOAuthRedirect({
	params,
	request,
	set,
}: {
	params: { provider: OAuthProvider };
	request: Request;
	set: { headers: Record<string, number | string>; redirect?: string; status?: number | string };
}) {
	const result = await getAuthorizationUrl(params.provider);

	if (!result) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('OAuth provider', RESOURCE_ERROR_CODES.RESOURCE_NOT_FOUND);
	}

	set.headers['set-cookie'] = buildOAuthBindCookie(result.state, request);
	set.redirect = result.url;
	return dataResponse({ url: result.url });
}

export { handleOAuthCallback, handleOAuthRedirect };
