/**
 * Helper to issue full auth tokens after successful MFA verification.
 *
 * Signs token pair, stores refresh hash, sets auth cookies, and returns user data.
 */

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { type AuthPayload, signTokenPair } from '../../plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../../plugins/csrf.ts';
import { getUserById } from '../../services/userService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setAuthCookies, storeRefreshTokenHash } from '../../utils/auth/authHelpers.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { unauthorizedError } from '../../utils/errorResponse.ts';

async function issueAuthTokensForUser(
	userId: number,
	request: Request,
	set: { headers: Record<string, number | string>; status?: number | string }
) {
	const config = getConfig();
	const dbUser = getUserById(userId);
	if (!dbUser) {
		set.status = HTTP_STATUS.UNAUTHORIZED;
		return unauthorizedError('User not found');
	}

	const payload: AuthPayload = { id: dbUser.id, role: dbUser.role };
	const tokens = signTokenPair(payload);
	storeRefreshTokenHash(userId, tokens.refreshToken);

	const csrfToken = await generateAndStoreCsrfToken(userId);
	setAuthCookies(set, config.security, tokens, request);

	if (csrfToken) {
		set.headers['X-CSRF-Token'] = csrfToken;
	}

	setCacheHeaders(set, 'NO_CACHE');

	return dataResponse({
		email: dbUser.email,
		id: dbUser.id,
		role: dbUser.role,
		roleLabels: config.roles,
		username: dbUser.username,
	});
}

export { issueAuthTokensForUser };
