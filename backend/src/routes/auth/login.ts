import { Elysia, t } from 'elysia';
import jwt from 'jsonwebtoken';

import type { ErrorCode } from '../../constants/errorCodes.ts';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	RATE_LIMITED_EXAMPLE,
	SUCCESS_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { PASSWORD_MAX_LENGTH } from '../../constants/validation.ts';
import { authPlugin, parseCookies, signTokenPair, verifyAccessToken } from '../../plugins/auth.ts';
import { csrfPlugin, generateAndStoreCsrfToken } from '../../plugins/csrf.ts';
import {
	getMfaStatus,
	isLoginSuccess,
	issueMfaChallengeToken,
	login,
	type LoginFailureReason,
} from '../../services/authService.ts';
import { trackEvent } from '../../services/metricsService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import {
	clearAuthCookies,
	clearCsrfToken,
	clearRefreshTokenHash,
	setAuthCookies,
	storeRefreshTokenHash,
} from '../../utils/auth/authHelpers.ts';
import { revokeAccessToken } from '../../utils/auth/tokenBlacklist.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import {
	AUTH_ERROR_CODES,
	serviceUnavailableError,
	unauthorizedError,
} from '../../utils/errorResponse.ts';
import { logAuth } from '../../utils/logger.ts';

// All failure reasons return generic 'Invalid credentials' to prevent user enumeration.
// The actual failure reason is logged server-side for security monitoring.
// The 'expired' case also returns AUTH_INVALID_CREDENTIALS to prevent enumeration;
// the /auth/me endpoint exposes requiresPasswordChange for legitimate post-login prompts.
const LOGIN_ERROR_MESSAGES: Record<LoginFailureReason, string> = {
	deleted: 'Invalid credentials',
	expired: 'Invalid credentials',
	invalid: 'Invalid credentials',
	locked: 'Invalid credentials',
};

const LOGIN_ERROR_CODES: Record<LoginFailureReason, ErrorCode> = {
	deleted: AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
	expired: AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
	invalid: AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
	locked: AUTH_ERROR_CODES.AUTH_INVALID_CREDENTIALS,
};

interface LoginBody {
	password: string;
	username: string;
}

interface LoginContext {
	body: LoginBody;
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}

async function handleLogin({ body, request, set }: LoginContext) {
	const config = getConfig();
	const ip = getClientIp(request);

	const result = await login(body.username, body.password, ip);
	if (!isLoginSuccess(result)) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError(
			LOGIN_ERROR_MESSAGES[result.reason],
			LOGIN_ERROR_CODES[result.reason]
		);
	}

	const mfaStatus = getMfaStatus(result.payload.id);
	if (mfaStatus?.isEnabled) {
		const mfaToken = issueMfaChallengeToken(result.payload.id);
		if (mfaToken !== null) {
			setCacheHeaders(set, 'NO_CACHE');
			trackEvent({
				eventCategory: 'user_action',
				eventName: 'mfa_challenge_issued',
				userId: result.payload.id,
			});
			return dataResponse({ mfaRequired: true, mfaToken });
		}
		logAuth('error', 'MFA enabled for user but challenge signing is unavailable', {
			userId: result.payload.id,
		});
		set.status = HTTP_STATUS.SERVICE_UNAVAILABLE;
		setCacheHeaders(set, 'NO_CACHE');
		return serviceUnavailableError(
			'MFA is not configured on this server. Contact an administrator.',
			AUTH_ERROR_CODES.AUTH_MFA_NOT_CONFIGURED
		);
	}

	const tokens = signTokenPair(result.payload);
	storeRefreshTokenHash(result.payload.id, tokens.refreshToken);

	const csrfToken = await generateAndStoreCsrfToken(result.payload.id);

	setAuthCookies(set, config.security, tokens, request);

	if (csrfToken) {
		set.headers['X-CSRF-Token'] = csrfToken;
	}

	setCacheHeaders(set, 'NO_CACHE');

	trackEvent({
		eventCategory: 'user_action',
		eventName: 'login',
		userId: result.payload.id,
	});

	return dataResponse({
		email: result.email,
		id: result.payload.id,
		requiresPasswordChange: result.requiresPasswordChange,
		role: result.payload.role,
		roleLabels: config.roles,
		username: result.username,
	});
}

interface LogoutContext {
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}

function revokeAccessTokenFromRequest(request: Request): void {
	const config = getConfig();
	const cookieHeader = request.headers.get('cookie');
	if (!cookieHeader) return;

	const accessToken = parseCookies(cookieHeader)[config.security.authCookieName];
	if (!accessToken) return;

	const payload = verifyAccessToken(accessToken);
	if (!payload) return;

	clearRefreshTokenHash(payload.id);
	clearCsrfToken(payload.id);

	const decoded = jwt.decode(accessToken) as { exp?: number } | null;
	if (!decoded?.exp) return;

	revokeAccessToken(accessToken, decoded.exp, payload.id);
}

function handleLogout({ request, set }: LogoutContext) {
	const config = getConfig();
	revokeAccessTokenFromRequest(request);
	clearAuthCookies(set, config.security, request);
	setCacheHeaders(set, 'NO_CACHE');
	return successResponse();
}

const authLoginRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' })
	.use(authPlugin)
	.use(csrfPlugin)
	.post('/login', handleLogin, {
		body: t.Object({
			password: t.String({ maxLength: PASSWORD_MAX_LENGTH, minLength: 1 }),
			username: t.String({ maxLength: 255, minLength: 1 }),
		}),
		detail: {
			description:
				'Authenticates a user with username and password. On success without MFA, sets ' +
				'HttpOnly auth cookies (access token + refresh token) and returns user profile. ' +
				'When the user has MFA enabled, returns { mfaRequired: true, mfaToken } instead — ' +
				'the client must POST mfaToken + TOTP code to /auth/mfa/verify to complete login. ' +
				'All login failures (bad credentials, expired password, locked or deleted account) ' +
				'return 401 with AUTH_INVALID_CREDENTIALS — intentionally uniform to prevent ' +
				'account enumeration.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								mfaRequired: dataExample('MFA challenge issued — verify required', {
									mfaRequired: true,
									mfaToken: '<short-lived ES256 JWT>',
								}),
								success: dataExample('Authenticated user profile', {
									email: 'admin@example.com',
									id: 1,
									role: 'ADMIN',
									username: 'admin',
								}),
							},
						},
					},
					description:
						'Login successful (auth cookies set) OR MFA challenge issued (no cookies).',
				},
				'401': {
					content: {
						'application/json': {
							examples: {
								accountLocked: {
									summary:
										'Account locked (intentionally indistinguishable from bad credentials)',
									value: {
										code: 'AUTH_INVALID_CREDENTIALS',
										error: 'Unauthorized',
										message: 'Invalid credentials',
									},
								},
								invalidCredentials: {
									summary: 'Wrong username or password',
									value: {
										code: 'AUTH_INVALID_CREDENTIALS',
										error: 'Unauthorized',
										message: 'Invalid credentials',
									},
								},
								passwordExpired: {
									summary: 'Password has expired',
									value: {
										code: 'AUTH_INVALID_CREDENTIALS',
										error: 'Unauthorized',
										message: 'Invalid credentials',
									},
								},
							},
						},
					},
					description:
						'Login failed. Always AUTH_INVALID_CREDENTIALS regardless of cause ' +
						'(bad credentials, locked, expired, deleted) to prevent enumeration.',
				},
				'429': RATE_LIMITED_EXAMPLE,
				'503': {
					content: {
						'application/json': {
							examples: {
								mfaNotConfigured: {
									summary: 'MFA challenge signing unavailable',
									value: {
										code: 'AUTH_MFA_NOT_CONFIGURED',
										error: 'Service unavailable',
										message:
											'MFA is not configured on this server. Contact an administrator.',
									},
								},
							},
						},
					},
					description:
						'MFA is enabled for the account, but the server cannot issue a challenge token.',
				},
			},
			summary: 'Login with username and password',
		},
	})
	.post('/logout', handleLogout, {
		detail: {
			description:
				'Logs out current user by clearing auth cookies and invalidating ' +
				'stored refresh token. Safe to call even without valid credentials — cookies ' +
				'are always cleared. Returns { data: null } on success.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'Logout successful — cookies cleared.',
				},
			},
			summary: 'Logout and clear auth cookies',
		},
	});

export { authLoginRoutes };
