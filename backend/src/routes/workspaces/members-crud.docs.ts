import {
	conflictExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const listWorkspaceMembersDocs = {
	description:
		'Returns all members of a workspace with their roles. The requesting user must ' +
		'be a member of workspace (or SYSOP). Each entry includes userId, username, email, ' +
		'and workspace role.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Workspace members', [
							{
								email: 'admin@example.com',
								role: 'ADMIN',
								userId: 1,
								username: 'admin',
							},
							{
								email: 'dev1@example.com',
								role: 'OPERATOR',
								userId: 4,
								username: 'dev1',
							},
						]),
					},
				},
			},
			description: 'Workspace member list.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
	},
	summary: 'Get workspace members',
};

const addWorkspaceMemberDocs = {
	description:
		'Adds a user to workspace with specified role (ADMIN, MANAGER, OPERATOR, or ' +
		'VIEWER). Returns 409 if user is already a member. Returns 201 on success. ' +
		'Requires workspace ADMIN role or SYSOP.',
	responses: {
		'201': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Member added to workspace.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'409': conflictExample('User is already a member'),
	},
	summary: 'Add a member to workspace (workspace ADMIN+)',
};

const removeWorkspaceMemberDocs = {
	description:
		'Removes a user from workspace by userId. Returns 404 if member is not found. ' +
		'Requires workspace ADMIN role or SYSOP.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Member removed from workspace.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Member'),
	},
	summary: 'Remove a member from workspace (workspace ADMIN+)',
};

const updateWorkspaceMemberRoleDocs = {
	description:
		"Changes a workspace member's role. Valid roles: ADMIN, MANAGER, OPERATOR, " +
		'VIEWER. Returns 404 if member is not found in workspace. Requires workspace ' +
		'ADMIN role or SYSOP.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Member role updated.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Member'),
	},
	summary: 'Update member role (workspace ADMIN+)',
};

export {
	addWorkspaceMemberDocs,
	listWorkspaceMembersDocs,
	removeWorkspaceMemberDocs,
	updateWorkspaceMemberRoleDocs,
};
