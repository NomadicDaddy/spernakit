import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';
import { SERVICE_ERRORS } from '../constants/serviceResults.ts';
import { requireRoleFresh } from '../guards/role.ts';
import { authPlugin } from '../plugins/auth.ts';
import {
	getTaskHistory,
	getTaskList,
	parseInterval,
	rescheduleTask,
	saveConfigOverride,
	triggerTask,
	updateTaskConfig,
} from '../services/schedulerService.ts';
import { dataResponse } from '../utils/apiResponse.ts';
import { badRequestError, notFoundError } from '../utils/errorResponse.ts';

interface UpdateTaskBody {
	cronExpression?: string;
	enabled?: boolean;
}

interface UpdateTaskContext {
	body: UpdateTaskBody;
	params: { name: string };
	set: { status?: number | string };
}

function handleUpdateTask({ body, params, set }: UpdateTaskContext) {
	// Validate cronExpression if provided
	if (body.cronExpression !== undefined) {
		try {
			parseInterval(body.cronExpression);
		} catch {
			set.status = HTTP_STATUS.BAD_REQUEST;
			return badRequestError(
				`Invalid schedule expression: "${body.cronExpression}". ` +
					'Expected format: "6h", "30m", "10s", "5000ms", or a raw millisecond number.'
			);
		}
	}

	const updates: { cronExpression?: string; enabled?: boolean } = {};
	if (body.cronExpression !== undefined) updates.cronExpression = body.cronExpression;
	if (body.enabled !== undefined) updates.enabled = body.enabled;

	const updated = updateTaskConfig(params.name, updates);

	if (!updated) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Task');
	}

	// Persist the override to the database
	saveConfigOverride(params.name, {
		cronExpression: updated.cronExpression,
		enabled: updated.enabled,
	});

	// Apply the change to the running scheduler
	rescheduleTask(params.name);

	return dataResponse({
		cronExpression: updated.cronExpression,
		enabled: updated.enabled,
		name: updated.name,
	});
}

const taskRoutes = new Elysia({ detail: { tags: ['Tasks'] }, prefix: '/tasks' })
	.use(authPlugin)
	.get(
		'/',
		() => {
			return dataResponse(getTaskList());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns all registered scheduled tasks with their configuration. Each task ' +
					'includes name, schedule (cron expression), enabled status, last run time, ' +
					'and next scheduled run. Requires ADMIN role or higher.',
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
			},
		}
	)
	.get(
		'/:name/history',
		({ params }) => {
			return dataResponse(getTaskHistory(params.name));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns recent execution history for a specific task by its name. Each ' +
					'entry includes start time, end time, duration, status (success/failure), ' +
					'and any error message. Requires ADMIN role or higher.',
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
			},
			params: t.Object({
				name: t.String({ maxLength: 100, minLength: 1, pattern: '^[a-z][a-z0-9_-]*$' }),
			}),
		}
	)
	.post(
		'/:name/trigger',
		async ({ params, set }) => {
			const result = await triggerTask(params.name);
			if (result.error === SERVICE_ERRORS.TASK_NOT_FOUND) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Task');
			}
			return dataResponse(result);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Manually triggers immediate execution of a scheduled task by name, ' +
					'bypassing its normal cron schedule. Returns 404 if the task name is not ' +
					'registered. Returns execution result with success status and any output. ' +
					'Requires ADMIN role or higher.',
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
			},
			params: t.Object({
				name: t.String({ maxLength: 100, minLength: 1, pattern: '^[a-z][a-z0-9_-]*$' }),
			}),
		}
	)
	.patch('/:name', handleUpdateTask, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		body: t.Object({
			cronExpression: t.Optional(
				t.String({ maxLength: 20, minLength: 1, pattern: '^\\d+(ms|[dhms])$' })
			),
			enabled: t.Optional(t.Boolean()),
		}),
		detail: {
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
		},
		params: t.Object({
			name: t.String({ maxLength: 100, minLength: 1, pattern: '^[a-z][a-z0-9_-]*$' }),
		}),
	});

export { taskRoutes };
