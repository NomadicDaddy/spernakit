import {
	dataExample,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const listDashboardsDocs = {
	description:
		'Returns all custom dashboards owned by authenticated user. ' +
		'Each dashboard includes metadata but not widgets (use GET /:id for full details).',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('User dashboards', [
							{
								createdAt: '2026-02-03T10:00:00.000Z',
								id: 1,
								name: 'My System Dashboard',
								shareExpiresAt: null,
								shareToken: null,
								updatedAt: '2026-02-03T10:00:00.000Z',
								userId: 1,
							},
						]),
					},
				},
			},
			description: 'List of user dashboards.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'List dashboards',
};

const getDashboardDocs = {
	description:
		'Returns a specific dashboard with all its widget configurations. ' +
		'Only dashboard owner can access it.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Dashboard with widgets', {
							id: 1,
							name: 'My Dashboard',
							widgets: [
								{
									col: 0,
									height: 2,
									id: 1,
									metricType: 'cpu_usage',
									row: 0,
									title: 'CPU Usage',
									widgetType: 'gauge',
									width: 3,
								},
							],
						}),
					},
				},
			},
			description: 'Dashboard with all widgets.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'404': notFoundExample('Dashboard'),
	},
	summary: 'Get dashboard',
};

const createDashboardDocs = {
	description:
		'Create a new custom dashboard. Optionally provide initial widget ' +
		'configurations. Each user is limited to a configurable maximum number ' +
		'of dashboards.',
	responses: {
		'201': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Created dashboard', {
							id: 1,
							name: 'My Dashboard',
							widgets: [],
						}),
					},
				},
			},
			description: 'Dashboard created successfully.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'Create dashboard',
};

const updateDashboardDocs = {
	description:
		'Update a dashboard name and/or replace all widget configurations. ' +
		'When widgets are provided, all existing widgets are replaced.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Updated dashboard', {
							id: 1,
							name: 'Updated Dashboard',
							widgets: [],
						}),
					},
				},
			},
			description: 'Dashboard updated successfully.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'404': notFoundExample('Dashboard'),
	},
	summary: 'Update dashboard',
};

const deleteDashboardDocs = {
	description:
		'Delete a dashboard and all its widgets. ' + 'Only the dashboard owner can delete it.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Dashboard deleted.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'404': notFoundExample('Dashboard'),
	},
	summary: 'Delete dashboard',
};

export {
	createDashboardDocs,
	deleteDashboardDocs,
	getDashboardDocs,
	listDashboardsDocs,
	updateDashboardDocs,
};
