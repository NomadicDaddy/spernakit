import { Elysia, t } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { DEFAULT_REFRESH_TTL_MS, parseDurationMs } from '../../constants/auth.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { MAX_BATCH_SIZE } from '../../constants/pagination.ts';
import {
	badRequestExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { UserRoleSchema } from '../../schemas/domain.ts';
import { bulkDeleteUsers, bulkUpdateUserRoles } from '../../services/userService.ts';
import { ROLE_HIERARCHY } from '../../types/roles.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { clearCsrfToken, clearRefreshTokenHash } from '../../utils/auth/authHelpers.ts';
import { revokeAllUserTokens } from '../../utils/auth/tokenBlacklist.ts';
import { badRequestError } from '../../utils/errorResponse.ts';

/**
 * Revoke tokens and clear credentials for users after bulk operations.
 * Forces re-authentication with updated role/status.
 */
function revokeTokensForResults(results: { id: number; success: boolean }[]): void {
	const config = getConfig();
	const refreshTtlMs = parseDurationMs(
		config.security.jwtRefreshExpiresIn,
		DEFAULT_REFRESH_TTL_MS
	);
	const revokeExpiry = new Date(Date.now() + refreshTtlMs);
	for (const item of results) {
		if (item.success) {
			revokeAllUserTokens(item.id, revokeExpiry);
			clearRefreshTokenHash(item.id);
			clearCsrfToken(item.id);
		}
	}
}

const usersBulkRoutes = new Elysia({
	detail: { tags: ['Users'] },
	prefix: '/users',
})
	.use(authPlugin)
	.post(
		'/bulk-delete',
		({ body, set, user }) => {
			const authUser = assertUser(user);
			if (body.ids.length > MAX_BATCH_SIZE) {
				set.status = HTTP_STATUS.BAD_REQUEST;
				return badRequestError(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`);
			}

			const requesterLevel = ROLE_HIERARCHY[authUser.role] ?? 0;
			const result = bulkDeleteUsers(body.ids, authUser.id, requesterLevel);

			revokeTokensForResults(result.results);
			return dataResponse(result);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			body: t.Object({
				ids: t.Array(t.Number({ minimum: 1 }), { maxItems: 100, minItems: 1 }),
			}),
			detail: {
				description:
					'Bulk soft-delete multiple users by their IDs. Each user is processed ' +
					'individually with same authorization checks as single DELETE ' +
					'endpoint. Returns partial success results indicating which users were ' +
					`deleted and which failed (with reasons). Maximum ${MAX_BATCH_SIZE} IDs ` +
					'per request. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									partialSuccess: dataExample('Partial success', {
										failed: 1,
										results: [
											{ id: 2, success: true },
											{
												error: 'Cannot delete user with equal or higher role level',
												id: 3,
												success: false,
											},
										],
										succeeded: 1,
										total: 2,
									}),
								},
							},
						},
						description: 'Batch delete result with per-item status.',
					},
					'400': badRequestExample(
						`Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`
					),
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Bulk delete users (ADMIN+)',
			},
		}
	)
	.put(
		'/bulk/roles',
		({ body, set, user }) => {
			const authUser = assertUser(user);
			if (body.updates.length > MAX_BATCH_SIZE) {
				set.status = HTTP_STATUS.BAD_REQUEST;
				return badRequestError(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`);
			}

			const requesterLevel = ROLE_HIERARCHY[authUser.role] ?? 0;
			const result = bulkUpdateUserRoles(
				body.updates.map((u) => ({ id: u.id, role: u.role })),
				requesterLevel
			);

			revokeTokensForResults(result.results);
			return dataResponse(result);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			body: t.Object({
				updates: t.Array(
					t.Object({
						id: t.Number(),
						role: UserRoleSchema,
					}),
					{ maxItems: 100, minItems: 1 }
				),
			}),
			detail: {
				description:
					'Bulk update user roles. Each update is processed individually with ' +
					'same authorization checks as single PUT endpoint. Cannot modify users ' +
					'with a role equal to or higher than your own, and cannot assign roles ' +
					'equal to or higher than your own. Returns partial success results. ' +
					`Maximum ${MAX_BATCH_SIZE} updates per request. Requires ADMIN role or higher.`,
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									partialSuccess: dataExample('Partial success', {
										failed: 1,
										results: [
											{ id: 2, success: true },
											{
												error: 'Cannot assign role equal to or higher than your own',
												id: 3,
												success: false,
											},
										],
										succeeded: 1,
										total: 2,
									}),
								},
							},
						},
						description: 'Batch role update result with per-item status.',
					},
					'400': badRequestExample(
						`Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`
					),
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Bulk update user roles (ADMIN+)',
			},
		}
	);

export { usersBulkRoutes };
