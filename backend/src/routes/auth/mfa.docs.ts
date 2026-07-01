import {
	dataExample,
	RATE_LIMITED_EXAMPLE,
	SUCCESS_EXAMPLE,
} from '../../constants/responseExamples.ts';

const mfaStatusDocs = {
	description: 'Returns whether MFA is enabled for the authenticated user.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						disabled: dataExample('MFA not enabled', {
							isEnabled: false,
							method: null,
							serverConfigured: true,
						}),
						enabled: dataExample('MFA enabled', {
							isEnabled: true,
							method: 'totp',
							serverConfigured: true,
						}),
					},
				},
			},
			description: 'MFA status retrieved.',
		},
	},
	summary: 'Get MFA status',
};

const mfaSetupDocs = {
	description:
		'Initiates TOTP MFA setup for the authenticated user. Requires the current ' +
		'password for step-up re-authentication. Returns a QR code URI (for scanning ' +
		'with an authenticator app) and the secret in base32. Recovery/backup codes ' +
		'are NOT returned here — they are emitted only after the user proves ' +
		'possession of the TOTP via POST /auth/mfa/verify-setup. MFA is NOT active ' +
		'until verified.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('MFA setup initiated', {
							qrUri: 'otpauth://totp/Spernakit:admin?secret=JBSWY3DPEHPK3PXP&issuer=Spernakit',
							secret: 'JBSWY3DPEHPK3PXP',
						}),
					},
				},
			},
			description: 'MFA setup initiated. Scan QR code with authenticator app.',
		},
		'401': {
			content: {
				'application/json': {
					examples: {
						invalidPassword: {
							summary: 'Current password incorrect',
							value: {
								code: 'AUTH_INVALID_CREDENTIALS',
								error: 'Unauthorized',
								message: 'Current password is incorrect.',
							},
						},
					},
				},
			},
			description: 'Current password did not verify.',
		},
		'429': RATE_LIMITED_EXAMPLE,
	},
	summary: 'Initiate MFA setup (password re-auth required)',
};

const mfaVerifySetupDocs = {
	description:
		'Verifies the initial TOTP code after MFA setup to confirm the user has ' +
		'correctly configured their authenticator app. On success, MFA is enabled ' +
		'and one-time backup/recovery codes are returned exactly once for the user ' +
		'to save.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('MFA verified — backup codes issued', {
							backupCodes: ['ABCD-EFGH', 'JKLM-NPQR'],
							success: true,
						}),
					},
				},
			},
			description: 'MFA verified and enabled; backup codes returned once.',
		},
		'401': {
			content: {
				'application/json': {
					examples: {
						invalidCode: {
							summary: 'Invalid TOTP code',
							value: {
								code: 'AUTH_MFA_INVALID_CODE',
								error: 'Unauthorized',
								message: 'Invalid verification code. Please try again.',
							},
						},
					},
				},
			},
			description: 'Invalid verification code.',
		},
		'429': RATE_LIMITED_EXAMPLE,
	},
	summary: 'Verify MFA setup',
};

const mfaVerifyDocs = {
	description:
		'Completes MFA verification during login. Accepts the MFA challenge token ' +
		'(returned by /auth/login when MFA is required) and a TOTP code. On success, ' +
		'sets auth cookies and returns user profile.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('MFA login completed', {
							email: 'admin@example.com',
							id: 1,
							role: 'ADMIN',
							username: 'admin',
						}),
					},
				},
			},
			description: 'MFA verified — auth cookies set.',
		},
		'401': {
			content: {
				'application/json': {
					examples: {
						invalidCode: {
							summary: 'Invalid TOTP code',
							value: {
								code: 'AUTH_MFA_INVALID_CODE',
								error: 'Unauthorized',
								message: 'Invalid MFA code. Please try again.',
							},
						},
						invalidToken: {
							summary: 'Challenge token expired',
							value: {
								code: 'AUTH_MFA_TOKEN_INVALID',
								error: 'Unauthorized',
								message: 'MFA challenge token is invalid or expired.',
							},
						},
					},
				},
			},
			description: 'Invalid MFA code or challenge token.',
		},
		'429': RATE_LIMITED_EXAMPLE,
	},
	summary: 'Verify MFA code during login',
};

const mfaVerifyRecoveryDocs = {
	description:
		'Completes MFA verification using a one-time recovery code. The code is ' +
		'consumed on use and cannot be reused. Use when the authenticator app is unavailable.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Recovery login completed', {
							email: 'admin@example.com',
							id: 1,
							role: 'ADMIN',
							username: 'admin',
						}),
					},
				},
			},
			description: 'Recovery code verified — auth cookies set.',
		},
		'401': {
			content: {
				'application/json': {
					examples: {
						invalidCode: {
							summary: 'Invalid recovery code',
							value: {
								code: 'AUTH_MFA_INVALID_CODE',
								error: 'Unauthorized',
								message: 'Invalid recovery code.',
							},
						},
					},
				},
			},
			description: 'Invalid recovery code or challenge token.',
		},
		'429': RATE_LIMITED_EXAMPLE,
	},
	summary: 'Verify with recovery code',
};

const mfaDisableDocs = {
	description: 'Disables MFA for the authenticated user. Requires a valid TOTP code to confirm.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'MFA disabled.',
		},
		'401': {
			content: {
				'application/json': {
					examples: {
						invalidCode: {
							summary: 'Invalid TOTP code',
							value: {
								code: 'AUTH_MFA_INVALID_CODE',
								error: 'Unauthorized',
								message: 'Invalid code. MFA was not disabled.',
							},
						},
					},
				},
			},
			description: 'Invalid verification code.',
		},
		'429': RATE_LIMITED_EXAMPLE,
	},
	summary: 'Disable MFA',
};

const mfaRegenerateRecoveryCodesDocs = {
	description:
		'Regenerates recovery codes for the authenticated user. Requires a valid ' +
		'TOTP code. Previous recovery codes are invalidated.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('New recovery codes', {
							backupCodes: ['ABCD-EFGH', 'JKLM-NPQR'],
						}),
					},
				},
			},
			description: 'Recovery codes regenerated.',
		},
		'429': RATE_LIMITED_EXAMPLE,
	},
	summary: 'Regenerate recovery codes',
};

export {
	mfaDisableDocs,
	mfaRegenerateRecoveryCodesDocs,
	mfaSetupDocs,
	mfaStatusDocs,
	mfaVerifyDocs,
	mfaVerifyRecoveryDocs,
	mfaVerifySetupDocs,
};
