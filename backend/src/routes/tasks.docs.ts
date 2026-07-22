import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';

const listTasksDocs = {
	description:
		'Returns all registered scheduled tasks with their configuration. Each task ' +
		'includes name, schedule (cron expression), enabled status, last run time, and ' +
		'next scheduled run. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Registered scheduled tasks', [
							{
								enabled: true,
								lastRun: '2026-01-15T10:25:00Z',
								name: 'health-check',
								nextRun: '2026-01-15T10:30:00Z',
								schedule: '*/5 * * * *',
							},
							{
								enabled: true,
								lastRun: '2026-01-15T02:00:00Z',
								name: 'audit-log-cleanup',
								nextRun: '2026-01-16T02:00:00Z',
								schedule: '0 2 * * *',
							},
							{
								enabled: false,
								lastRun: null,
								name: 'session-cleanup',
								nextRun: null,
								schedule: '0 */6 * * *',
							},
						]),
					},
				},
			},
			description: 'List of registered tasks.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
	},
	summary: 'List all registered tasks (ADMIN+)',
};

const taskHistoryDocs = {
	description:
		'Returns recent execution history for a specific task by its name. Each entry ' +
		'includes start time, end time, duration, status (success/failure), and any error ' +
		'message. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Health check task history', [
							{
								durationMs: 1023,
								endedAt: '2026-01-15T10:25:01Z',
								error: null,
								startedAt: '2026-01-15T10:25:00Z',
								status: 'success',
							},
							{
								durationMs: 5012,
								endedAt: '2026-01-15T10:20:05Z',
								error: 'Database connection timeout',
								startedAt: '2026-01-15T10:20:00Z',
								status: 'failure',
							},
						]),
					},
				},
			},
			description: 'Task execution history.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
	},
	summary: 'Get task execution history (ADMIN+)',
};

const triggerTaskDocs = {
	description:
		'Manually triggers immediate execution of a scheduled task by name, bypassing its ' +
		'normal cron schedule. Returns 404 if the task name is not registered. Returns ' +
		'execution result with success status and any output. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Task executed successfully', {
							durationMs: 842,
							name: 'health-check',
							output: 'All checks passed',
							status: 'success',
						}),
					},
				},
			},
			description: 'Task triggered successfully.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Task'),
	},
	summary: 'Manually trigger a task (ADMIN+)',
};

const updateTaskDocs = {
	description:
		"Update a scheduled task's configuration. Supports changing the schedule " +
		'(cron expression) and enabling/disabling the task. Changes take effect ' +
		'immediately and are persisted across restarts. Requires ADMIN role or higher.',
	responses: {
		'200': {
			content: {
				'application/json': {
					examples: {
						success: dataExample('Task configuration updated', {
							cronExpression: '12h',
							enabled: true,
							name: 'audit-log-archive',
						}),
					},
				},
			},
			description: 'Updated task configuration.',
		},
		'400': {
			content: {
				'application/json': {
					examples: {
						error: {
							summary: 'Invalid schedule expression',
							value: {
								error: 'Invalid schedule expression: "abc"',
								status: 'error',
							},
						},
					},
				},
			},
			description: 'Invalid schedule expression.',
		},
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Task'),
	},
	summary: 'Update task configuration (ADMIN+)',
};

export { listTasksDocs, taskHistoryDocs, triggerTaskDocs, updateTaskDocs };
