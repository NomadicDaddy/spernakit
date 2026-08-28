import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const shareDashboardDocs = {
	description:
		'Generate a share token for a dashboard, or return the existing one when a link is ' +
		'already live. Shared dashboards are read-only and accessible via the /shared/:token ' +
		'endpoint. To rotate a link, revoke it first. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Share token generated', {
							shareExpiresAt: '2026-03-05T10:00:00.000Z',
							shareToken: 'abc123...',
						}),
					},
				},
			},
			description: 'Share token generated.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Dashboard'),
	},
	summary: 'Share dashboard (ADMIN+)',
};

const getShareStateDocs = {
	description:
		'Report whether a dashboard currently has a working share link and when it expires. ' +
		'The token itself is not returned; this answers whether one is out there. Requires ' +
		'ADMIN role or higher, the same as sharing.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						active: dataExample('Share link is live', {
							expiresAt: '2026-03-05T10:00:00.000Z',
							isActive: true,
						}),
						inactive: dataExample('No share link', {
							expiresAt: null,
							isActive: false,
						}),
					},
				},
			},
			description: 'Current share state.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Dashboard'),
	},
	summary: 'Get dashboard share state (ADMIN+)',
};

const revokeShareDocs = {
	description:
		'Revoke a dashboard share link. The previously issued URL then answers the same ' +
		'not-found response as a token that never existed, and a later share mints a new ' +
		'token rather than reusing the revoked one. Revoking a dashboard that has no live ' +
		'link succeeds and changes nothing. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Share link revoked', {
							expiresAt: null,
							isActive: false,
						}),
					},
				},
			},
			description: 'Share link revoked.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Dashboard'),
	},
	summary: 'Revoke dashboard share link (ADMIN+)',
};

const exportDashboardDocs = {
	description:
		'Export a dashboard configuration as a portable JSON structure. ' +
		'The export can be imported into the same or a different instance.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Exported dashboard', {
							name: 'My Dashboard',
							version: 1,
							widgets: [],
						}),
					},
				},
			},
			description: 'Dashboard export data.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'404': notFoundExample('Dashboard'),
	},
	summary: 'Export dashboard',
};

export { exportDashboardDocs, getShareStateDocs, revokeShareDocs, shareDashboardDocs };
