import {
	badRequestExample,
	conflictExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	paginatedExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const listUsersDocs = {
	description:
		'Returns a paginated list of users. Supports filtering by role and ' +
		'free-text search (matches username and email). Default page size is 20, ' +
		'max 100. Returns { data: [...], page, limit, total }. ' +
		'Use optional `fields` parameter to request only specific fields ' +
		'(e.g. `fields=id,username,email`). Allowed fields: id, username, email, ' +
		'role, createdAt, updatedAt, lastLoginAt. ' +
		'Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: paginatedExample(
							'Page 1 of users',
							[
								{
									email: 'admin@example.com',
									id: 1,
									role: 'ADMIN',
									username: 'admin',
								},
								{
									email: 'viewer@example.com',
									id: 2,
									role: 'VIEWER',
									username: 'viewer1',
								},
							],
							42
						),
					},
				},
			},
			description: 'Paginated user list.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
	},
	summary: 'List users with pagination and filters (ADMIN+)',
};

const getUserByIdDocs = {
	description:
		'Returns a single user by their numeric ID. Includes id, username, email, ' +
		'role, and timestamps. Returns 404 if user does not exist or was ' +
		'deleted. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('User by ID', {
							createdAt: '2026-01-15T10:30:00.000Z',
							email: 'jdoe@example.com',
							id: 2,
							role: 'OPERATOR',
							updatedAt: '2026-01-20T14:00:00.000Z',
							username: 'jdoe',
						}),
					},
				},
			},
			description: 'User details.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('User'),
	},
	summary: 'Get user by ID (ADMIN+)',
};

const createUserDocs = {
	description:
		'Creates a new user account. Username must be 2-50 alphanumeric characters, ' +
		'password 8-128 characters, and email must be valid. Role defaults to VIEWER ' +
		'if not specified. You cannot create users with a role equal to or higher than ' +
		'your own (returns 403). Returns 409 if username or email is already taken. ' +
		'Returns 201 on success. Requires ADMIN role or higher.',
	responses: {
		'201': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Newly created user', {
							email: 'newuser@example.com',
							id: 3,
							role: 'VIEWER',
							username: 'newuser',
						}),
					},
				},
			},
			description: 'User created successfully.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'409': conflictExample('Username already taken'),
	},
	summary: 'Create a new user (ADMIN+)',
};

const updateUserDocs = {
	description:
		'Updates an existing user by ID. All body fields are optional. Cannot ' +
		'modify users with a role equal to or higher than your own (returns 403). ' +
		'Cannot assign a role equal to or higher than your own. Returns 409 if ' +
		'the new username or email conflicts with another user. Requires ADMIN role ' +
		'or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Updated user', {
							email: 'jdoe@example.com',
							id: 2,
							role: 'OPERATOR',
							username: 'jdoe-updated',
						}),
					},
				},
			},
			description: 'User updated.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('User'),
		'409': conflictExample('Email already taken'),
	},
	summary: 'Update user by ID (ADMIN+)',
};

const deleteUserDocs = {
	description:
		'Soft-deletes a user by ID (marks as deleted, does not remove from database). ' +
		'Cannot delete your own account (returns 400) or users with a role equal to ' +
		"or higher than your own (returns 403). The deleted user's refresh token is " +
		'not invalidated - they will be blocked at next token verification. Requires ' +
		'ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'User soft-deleted.',
		},
		'400': badRequestExample('Cannot delete your own account'),
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('User'),
	},
	summary: 'Soft delete user by ID (ADMIN+)',
};

const unlockUserDocs = {
	description:
		'Unlocks a locked user account by resetting failed login attempts to 0 and ' +
		'clearing the lockout timestamp. Cannot unlock users with a role equal to or ' +
		'higher than your own (returns 403). Returns 404 if user does not exist. ' +
		'Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'User account unlocked.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('User'),
	},
	summary: 'Unlock user account (ADMIN+)',
};

const adminResetPasswordDocs = {
	description:
		"Allows an admin to reset another user's password in two modes: " +
		"'set' (directly provide a new password) or 'email' (send a self-service reset token). " +
		'Target users are forced through /change-password on next login. ' +
		'SYSOP users can only be reset by other SYSOPs. ' +
		'Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Password reset successful.',
		},
		'400': badRequestExample('Password reset failed'),
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('User'),
	},
	summary: "Admin reset user's password (ADMIN+)",
};

export {
	adminResetPasswordDocs,
	createUserDocs,
	deleteUserDocs,
	getUserByIdDocs,
	listUsersDocs,
	unlockUserDocs,
	updateUserDocs,
};
