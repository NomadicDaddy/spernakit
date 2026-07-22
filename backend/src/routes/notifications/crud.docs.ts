import {
	dataExample,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

const listNotificationsDocs = {
	description:
		'Returns a paginated list of notifications for the authenticated user. ' +
		'Filter by readStatus (all, read, unread) and/or type (info, warning, ' +
		'error, success). Use the optional `fields` parameter to request only ' +
		'specific fields (e.g. `fields=id,title,type,readAt`). ' +
		'Returns { data: [...], page, limit, total }.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Page 1 of notifications', [
							{
								createdAt: '2026-02-03T06:00:00.000Z',
								id: 10,
								isRead: false,
								message: 'Daily backup finished successfully.',
								title: 'Backup completed',
								type: 'success',
							},
							{
								createdAt: '2026-02-02T18:30:00.000Z',
								id: 9,
								isRead: true,
								message: 'Disk usage above 85%.',
								title: 'Disk space warning',
								type: 'warning',
							},
						]),
					},
				},
			},
			description: 'Paginated notification list.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'List notifications with pagination and filters',
};

const getNotificationDocs = {
	description:
		'Returns a single notification by its numeric ID. Only accessible to the ' +
		'user that the notification belongs to. Returns 404 if not found or not owned. ' +
		'This is an API-only endpoint for programmatic consumers (e.g., API-key ' +
		'integrations). The frontend UI uses the list endpoint instead.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Single notification', {
							createdAt: '2026-02-03T06:00:00.000Z',
							id: 10,
							isRead: false,
							message: 'Daily backup finished successfully.',
							title: 'Backup completed',
							type: 'success',
							userId: 1,
						}),
					},
				},
			},
			description: 'Notification details.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'404': notFoundExample('Notification'),
	},
	summary: 'Get notification by ID',
};

const createNotificationDocs = {
	description:
		'Creates a new notification for a user. Defaults to the authenticated user ' +
		'if userId is not provided. Type defaults to "info" if not specified (valid: ' +
		'info, warning, error, success). Optionally scoped to a workspace via ' +
		'X-Workspace-Id header. Returns 201 on success. This is an API-only endpoint ' +
		'for programmatic consumers (e.g., scheduled tasks, external integrations via ' +
		'API keys). Notifications are system-generated and not created through the UI.',
	responses: {
		'201': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('New notification', {
							createdAt: '2026-02-03T14:00:00.000Z',
							id: 11,
							isRead: false,
							message: 'Production deployment has been initiated.',
							title: 'Deploy started',
							type: 'info',
							userId: 1,
						}),
					},
				},
			},
			description: 'Notification created.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'Create a notification',
};

const deleteNotificationDocs = {
	description:
		'Permanently deletes a notification by its ID. Only the notification owner ' +
		'can delete it. Returns 404 if not found or not owned.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: { success: SUCCESS_EXAMPLE },
				},
			},
			description: 'Notification deleted.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'404': notFoundExample('Notification'),
	},
	summary: 'Delete a notification',
};

const bulkDeleteNotificationsDocs = {
	description:
		'Deletes multiple notifications in a single request. Pass an array of ' +
		'notification IDs in the body. Only notifications owned by the authenticated ' +
		'user are deleted. Returns { data: { count: number } } with the number removed.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Bulk delete result', { count: 3 }),
					},
				},
			},
			description: 'Bulk delete result.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
	},
	summary: 'Bulk delete notifications',
};

export {
	bulkDeleteNotificationsDocs,
	createNotificationDocs,
	deleteNotificationDocs,
	getNotificationDocs,
	listNotificationsDocs,
};
