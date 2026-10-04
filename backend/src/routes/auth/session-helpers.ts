/**
 * Helper shared by every route that signs a user in: password login, MFA verification and OAuth.
 */

import { type AuthPayload, signTokenPair } from '../../plugins/auth.ts';
import { newRefreshFamilyId, storeRefreshSession } from '../../utils/auth/refreshSessions.ts';

/**
 * Sign the token pair for a new sign-in and record its refresh token as a family of its own.
 *
 * Both tokens carry the family id: the refresh token so rotation stays inside the family, the
 * access token so logout can end this sign-in without touching the user's other browsers.
 */
function startSignIn(payload: AuthPayload): { accessToken: string; refreshToken: string } {
	const familyId = newRefreshFamilyId();
	const tokens = signTokenPair({ ...payload, sid: familyId });
	storeRefreshSession(payload.id, familyId, tokens.refreshToken);
	return tokens;
}

export { startSignIn };
