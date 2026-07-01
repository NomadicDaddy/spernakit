import {
	conflictExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const listWorkspacesDocs = {
	description:
		'Returns paginated workspaces the authenticated user is a member of. SYSOP users ' +
		'see all workspaces regardless of membership. Each workspace includes id, ' +
		'name, slug, description, ownerId, ownerUsername (resolved via JOIN, null if the ' +
		'owner was deleted), settings, and timestamps. Supports pagination via page and ' +
		'limit query parameters.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('User workspaces', [
							{
								description: 'Engineering team workspace',
								id: 1,
								name: 'Engineering',
								ownerId: 1,
								ownerUsername: 'sysop',
								slug: 'engineering',
							},
							{
								description: null,
								id: 2,
								name: 'Marketing',
								ownerId: 3,
								ownerUsername: 'alice',
								slug: 'marketing',
							},
						]),
					},
				},
			},
			description: 'Paginated list of workspaces.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'List workspaces for current user',
};

const getWorkspaceByIdDocs = {
	description:
		'Returns a single workspace by numeric ID. The user must be a member of ' +
		'the workspace (or SYSOP). Returns 404 if workspace does not exist.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Workspace by ID', {
							createdAt: '2026-01-10T08:00:00.000Z',
							description: 'Engineering team workspace',
							id: 1,
							name: 'Engineering',
							ownerId: 1,
							ownerUsername: 'sysop',
							slug: 'engineering',
							updatedAt: '2026-01-10T08:00:00.000Z',
						}),
					},
				},
			},
			description: 'Workspace details.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Workspace'),
	},
	summary: 'Get workspace by ID',
};

const createWorkspaceDocs = {
	description:
		'Creates a new workspace. The authenticated user becomes the owner. Name and ' +
		'slug are required; description is optional. The slug must be unique. Returns ' +
		'201 on success. Requires ADMIN role or higher.',
	responses: {
		'201': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('New workspace', {
							description: 'Design team workspace',
							id: 3,
							name: 'Design',
							ownerId: 1,
							ownerUsername: 'sysop',
							slug: 'design',
						}),
					},
				},
			},
			description: 'Workspace created.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'409': conflictExample('Workspace slug already exists'),
	},
	summary: 'Create a workspace (ADMIN+)',
};

const updateWorkspaceDocs = {
	description:
		"Updates a workspace's name, description, and/or settings. Only workspace-level ADMIN " +
		'members or global ADMIN+ users can update. Returns 404 if not found.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Updated workspace', {
							description: 'Updated description',
							id: 1,
							name: 'Engineering (Renamed)',
							ownerId: 1,
							ownerUsername: 'sysop',
							slug: 'engineering',
						}),
					},
				},
			},
			description: 'Workspace updated.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Workspace'),
	},
	summary: 'Update a workspace',
};

const deleteWorkspaceDocs = {
	description:
		'Soft-deletes a workspace by ID (marks as deleted, preserves data). ' +
		'Returns 404 if workspace does not exist. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Workspace soft-deleted.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Workspace'),
	},
	summary: 'Delete a workspace (ADMIN+)',
};

export {
	createWorkspaceDocs,
	deleteWorkspaceDocs,
	getWorkspaceByIdDocs,
	listWorkspacesDocs,
	updateWorkspaceDocs,
};
