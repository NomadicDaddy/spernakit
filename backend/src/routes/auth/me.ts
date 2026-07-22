import { Elysia } from 'elysia';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { UNAUTHORIZED_EXAMPLE } from '../../constants/responseExamples.ts';
import { assertUser, requireAuth } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { generateAndStoreCsrfToken } from '../../plugins/csrf.ts';
import { getUserAuthStatus } from '../../services/userService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { AUTH_ERROR_CODES, unauthorizedError } from '../../utils/errorResponse.ts';

const authMeRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' })
	.use(authPlugin)
	.get(
		'/me',
		async ({ set, user }) => {
			const authUser = assertUser(user);
			const dbUser = getUserAuthStatus(authUser.id);

			if (!dbUser || dbUser.isDeleted) {
				set.status = HTTP_STATUS.UNAUTHORIZED;
				return unauthorizedError(
					'Account has been deleted',
					AUTH_ERROR_CODES.AUTH_ACCOUNT_DELETED
				);
			}

			// Provide a CSRF token so the frontend can make state-changing requests
			// after page reloads (where the in-memory CSRF token is lost)
			const csrfToken = await generateAndStoreCsrfToken(authUser.id);
			set.headers['X-CSRF-Token'] = csrfToken;

			return dataResponse({
				email: dbUser.email,
				id: authUser.id,
				impersonatedBy: authUser.impersonatedBy ?? null,
				requiresPasswordChange: dbUser.requiresPasswordChange,
				role: dbUser.role,
				roleLabels: getConfig().roles,
				username: dbUser.username,
			});
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns profile of currently authenticated user (id, username, ' +
					'email, role). Requires a valid access token cookie. Returns 401 with ' +
					'AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID, or AUTH_ACCOUNT_DELETED as ' +
					'applicable.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: {
										summary: 'Authenticated user',
										value: {
											data: {
												email: 'admin@example.com',
												id: 1,
												role: 'ADMIN',
												username: 'admin',
											},
										},
									},
								},
							},
						},
						description: 'Current user profile.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Get current authenticated user',
			},
		}
	);

export { authMeRoutes };
