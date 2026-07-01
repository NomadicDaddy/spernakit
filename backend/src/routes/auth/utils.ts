import { Elysia } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { getAuthSettings, isPasswordExpired } from '../../services/authService.ts';
import { getDemoAccounts } from '../../services/demoService.ts';
import { getAllUsersSecurityInfo } from '../../services/userService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import { forbiddenError } from '../../utils/errorResponse.ts';

const authUtilsRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' })
	.use(authPlugin)
	.get(
		'/security-health',
		({ set }) => {
			const authSettings = getAuthSettings();
			const allUsers = getAllUsersSecurityInfo();

			const results = {
				authSettings,
				users: allUsers.map((user) => {
					const issues: string[] = [];

					if (authSettings.passwordExpiryDays > 0) {
						if (isPasswordExpired(user.passwordChangedAt)) {
							issues.push('Password expired');
						}
					}

					if (
						authSettings.enableAccountLocking &&
						user.lockedUntil &&
						user.lockedUntil > new Date()
					) {
						issues.push('Account locked');
					}

					return {
						email: user.email,
						id: user.id,
						issues,
						username: user.username,
					};
				}),
			};

			setCacheHeaders(set, 'NO_CACHE');
			return dataResponse(results);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Checks password policy compliance across all users. Returns auth ' +
					'security settings and list of users with any compliance issues (expired ' +
					'passwords, locked accounts). Useful for security auditing and password ' +
					'policy enforcement. Cached for 5 minutes. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Security health report', {
										authSettings: {
											enableAccountLocking: true,
											lockoutDurationMinutes: 15,
											maxLoginAttempts: 5,
											minPasswordAgeDays: 1,
											passwordExpiryDays: 90,
											requirePasswordChange: true,
										},
										users: [
											{
												email: 'user@example.com',
												id: 1,
												issues: [],
												username: 'user1',
											},
											{
												email: 'expired@example.com',
												id: 2,
												issues: ['Password expired'],
												username: 'user2',
											},
										],
									}),
								},
							},
						},
						description: 'Security health report with user issues.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get security health report (ADMIN+)',
			},
		}
	)
	.get(
		'/demo-accounts',
		({ request, set }) => {
			const demoAccounts = getDemoAccounts(getClientIp(request));

			if (!demoAccounts) {
				set.status = HTTP_STATUS.FORBIDDEN;
				return forbiddenError('Demo accounts are only available in development mode');
			}

			setCacheHeaders(set, 'LONG');
			return dataResponse({
				accounts: demoAccounts,
				warning:
					'These demo accounts are for development and testing only. Never use these credentials in production.',
			});
		},
		{
			detail: {
				description:
					'Returns demo account credentials for quick testing and development. ' +
					'Only available in development mode and returns 403 in production. ' +
					'Demo accounts include all five RBAC roles: SYSOP, ADMIN, MANAGER, ' +
					'OPERATOR, VIEWER. All demo passwords are weak and should be changed ' +
					'in production. Response is cached for 1 hour.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Demo accounts for testing', {
										accounts: [
											{
												description:
													'System administrator with full access',
												password: 'sysop123',
												role: 'SYSOP',
												username: 'sysop',
											},
											{
												description: 'Application administrator',
												password: 'admin123',
												role: 'ADMIN',
												username: 'admin',
											},
										],
										warning:
											'These demo accounts are for development and testing only. Never use these credentials in production.',
									}),
								},
							},
						},
						description: 'Demo accounts list.',
					},
					'403': {
						content: {
							'application/json': {
								examples: {
									forbidden: {
										summary: 'Demo accounts not available',
										value: {
											code: 'FORBIDDEN',
											error: 'Demo accounts not available',
											message:
												'Demo accounts are only available in development mode',
										},
									},
								},
							},
						},
						description: 'Demo accounts disabled or in production mode.',
					},
				},
				summary: 'Get demo accounts (development only)',
			},
		}
	);

export { authUtilsRoutes };
