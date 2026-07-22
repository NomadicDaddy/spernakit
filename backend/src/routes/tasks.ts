import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
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
import { listTasksDocs, taskHistoryDocs, triggerTaskDocs, updateTaskDocs } from './tasks.docs.ts';

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
			detail: listTasksDocs,
		}
	)
	.get(
		'/:name/history',
		({ params }) => {
			return dataResponse(getTaskHistory(params.name));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: taskHistoryDocs,
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
			detail: triggerTaskDocs,
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
		detail: updateTaskDocs,
		params: t.Object({
			name: t.String({ maxLength: 100, minLength: 1, pattern: '^[a-z][a-z0-9_-]*$' }),
		}),
	});

export { taskRoutes };
