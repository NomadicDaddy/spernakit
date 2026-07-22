import {
	badRequestExample,
	conflictExample,
	dataExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const updateProfileDocs = {
	description:
		"Updates authenticated user's own profile (username only). " +
		'Email changes must go through POST /users/me/email-change which requires ' +
		'password re-authentication and an out-of-band confirmation link delivered ' +
		'to the new address. Username must be 2-50 alphanumeric characters ' +
		'(plus _ . -). Returns 409 if new username is already taken.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Updated user profile', {
							email: 'user@example.com',
							id: 1,
							role: 'ADMIN',
							username: 'newname',
						}),
					},
				},
			},
			description: 'Profile updated successfully.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'409': conflictExample('Username already taken'),
	},
	summary: 'Update current user profile (username)',
};

const requestEmailChangeDocs = {
	description:
		'Initiates an email change for the authenticated user. Requires the current ' +
		'password for step-up re-authentication. Sends a one-time confirmation link ' +
		'to the NEW address and an informational notification to the OLD address. ' +
		"The user's account email is NOT changed until the confirmation link is " +
		'clicked via POST /auth/confirm-email-change. Returns 401 if the current ' +
		'password is incorrect, 409 if the new email is already in use.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Confirmation email dispatched', {
							pending: true,
						}),
					},
				},
			},
			description: 'Email change pending confirmation.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'409': conflictExample('Email address is already in use'),
	},
	summary: 'Request email change (step-up + out-of-band confirmation)',
};

const handleChangePasswordDocs = {
	description:
		"Changes authenticated user's password. Requires current password " +
		'for verification. New password must be 8-128 characters. On success, all ' +
		'existing refresh tokens are invalidated (user must re-login on other ' +
		'devices). Returns 400 if current password is incorrect.',
	responses: {
		'200': {
			content: {
				'application/json': { examples: { success: SUCCESS_EXAMPLE } },
			},
			description: 'Password changed - refresh tokens invalidated.',
		},
		'400': badRequestExample('Current password is incorrect or password is too weak'),
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'Change current user password',
};

const checkUsernameDocs = {
	description:
		'Checks if a username is available. Excludes the current user so checking ' +
		'your own username returns available. Validates the same pattern as the profile ' +
		'update endpoint (2-50 alphanumeric characters plus _ . -).',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						available: dataExample('Username available', {
							available: true,
						}),
						taken: dataExample('Username taken', {
							available: false,
						}),
					},
				},
			},
			description: 'Username availability result.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'Check username availability',
};

export { checkUsernameDocs, handleChangePasswordDocs, requestEmailChangeDocs, updateProfileDocs };
