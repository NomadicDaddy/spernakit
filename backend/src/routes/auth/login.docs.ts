import {
	dataExample,
	RATE_LIMITED_EXAMPLE,
	SUCCESS_EXAMPLE,
} from '../../constants/responseExamples.ts';

const loginDocs = {
	description:
		'Authenticates a user with username and password. On success without MFA, sets ' +
		'HttpOnly auth cookies (access token + refresh token) and returns user profile. ' +
		'When the user has MFA enabled, returns { mfaRequired: true, mfaToken } instead - ' +
		'the client must POST mfaToken + TOTP code to /auth/mfa/verify to complete login. ' +
		'All login failures (bad credentials, expired password, locked or deleted account) ' +
		'return 401 with AUTH_INVALID_CREDENTIALS - intentionally uniform to prevent ' +
		'account enumeration.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						mfaRequired: dataExample('MFA challenge issued - verify required', {
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
};

const logoutDocs = {
	description:
		'Logs out current user by clearing auth cookies and invalidating ' +
		'stored refresh token. Safe to call even without valid credentials - cookies ' +
		'are always cleared. Returns { data: null } on success.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Logout successful - cookies cleared.',
		},
	},
	summary: 'Logout and clear auth cookies',
};

export { loginDocs, logoutDocs };
