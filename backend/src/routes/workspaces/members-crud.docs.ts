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
		'and workspace role. A workspace that does not exist answers 404 rather than an ' +
		'empty list; an empty list means the workspace is there and has no members.',
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
		'404': notFoundExample('Workspace'),
	},
	summary: 'Get workspace members',
};

/**
 * The add route can be told about two things that are not there, and answers 404 for both.
 *
 * `notFoundExample` describes one resource, so the two are spelled out here rather than picking
 * whichever one the reader is less likely to hit.
 */
const ADD_MEMBER_NOT_FOUND_EXAMPLE = {
	content: {
		'application/json': {
			examples: {
				noSuchUser: {
					summary: 'User does not exist',
					value: {
						code: 'RESOURCE_NOT_FOUND',
						error: 'Not found',
						message: 'User not found',
					},
				},
				noSuchWorkspace: {
					summary: 'Workspace does not exist',
					value: {
						code: 'RESOURCE_NOT_FOUND',
						error: 'Not found',
						message: 'Workspace not found',
					},
				},
			},
		},
	},
	description: 'Workspace or user not found.',
};

const addWorkspaceMemberDocs = {
	description:
		'Adds a user to workspace with specified role (ADMIN, MANAGER, OPERATOR, or ' +
		'VIEWER). Returns 404 if the workspace does not exist and 404 if the user does ' +
		'not exist, matching what the bulk route reports for the same user id. Returns ' +
		'409 only when the user exists and is already a member. Returns 201 on success. ' +
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
		'404': ADD_MEMBER_NOT_FOUND_EXAMPLE,
		'409': conflictExample('User is already a member'),
	},
	summary: 'Add a member to workspace (workspace ADMIN+)',
};

const removeWorkspaceMemberDocs = {
	description:
		'Removes a user from workspace by userId. Returns 404 if the workspace does not ' +
		'exist, and 404 if it does and the member is not in it. Requires workspace ADMIN ' +
		'role or SYSOP.',
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
		'VIEWER. Returns 404 if the workspace does not exist, and 404 if it does and the ' +
		'member is not in it. Requires workspace ADMIN role or SYSOP.',
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
