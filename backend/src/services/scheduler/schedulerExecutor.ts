import { desc, eq } from 'drizzle-orm';

import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import { getDb } from '../../db/index.ts';
import { scheduledTaskExecutions } from '../../db/schema/scheduledTasks.ts';
import { logScheduler } from '../../utils/logger.ts';
import { log as logAudit } from '../auditService.ts';
import { tasks } from './schedulerRegistry.ts';

/**
 * Create an execution record for a task that is about to run.
 * @param taskName
 * @param startedAt
 * @returns Execution record ID
 */
function createExecution(taskName: string, startedAt: Date): number {
	return getDb()
		.insert(scheduledTaskExecutions)
		.values({ startedAt, status: 'running', taskName })
		.returning({ id: scheduledTaskExecutions.id })
		.get().id;
}

/**
 * Mark an execution as completed with its result.
 * @param id
 * @param result
 * @param startedAt
 * @returns Duration in milliseconds
 */
function completeExecution(id: number, result: unknown, startedAt: Date): number {
	const completedAt = new Date();
	const durationMs = completedAt.getTime() - startedAt.getTime();
	getDb()
		.update(scheduledTaskExecutions)
		.set({
			completedAt,
			durationMs,
			result: result as Record<string, unknown>,
			status: 'completed',
		})
		.where(eq(scheduledTaskExecutions.id, id))
		.run();
	return durationMs;
}

/**
 * Mark an execution as failed with error details.
 * @param id
 * @param error
 * @param startedAt
 * @returns Duration in milliseconds
 */
function failExecution(id: number, error: string, startedAt: Date): number {
	const completedAt = new Date();
	const durationMs = completedAt.getTime() - startedAt.getTime();
	getDb()
		.update(scheduledTaskExecutions)
		.set({ completedAt, durationMs, error, status: 'failed' })
		.where(eq(scheduledTaskExecutions.id, id))
		.run();
	return durationMs;
}

/**
 * Execute a task by name and log result.
 * @param taskName
 * @returns Execution result with duration, error, and status
 */
async function executeTask(
	taskName: string
): Promise<{ durationMs: number; error: null | string; status: string }> {
	const task = tasks.get(taskName);
	if (!task) {
		return { durationMs: 0, error: SERVICE_ERRORS.TASK_NOT_FOUND, status: 'failed' };
	}

	const startedAt = new Date();
	const executionId = createExecution(taskName, startedAt);

	try {
		const result = await task.handler();
		const durationMs = completeExecution(executionId, result, startedAt);
		logScheduler('info', 'Task completed', { durationMs, taskName });
		return { durationMs, error: null, status: 'completed' };
	} catch (err) {
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		const durationMs = failExecution(executionId, errorMessage, startedAt);
		logScheduler('error', 'Task failed', { error: errorMessage, taskName });
		return { durationMs, error: errorMessage, status: 'failed' };
	}
}

/**
 * Manually trigger a task by name.
 *
 * @param taskName - Name of task to trigger
 * @returns Execution result
 */
async function triggerTask(
	taskName: string
): Promise<{ durationMs: number; error: null | string; status: string }> {
	const result = await executeTask(taskName);

	logAudit({
		action: 'TASK_TRIGGER',
		details: {
			durationMs: result.durationMs,
			error: result.error,
			status: result.status,
			taskName,
		},
		entityType: 'scheduled_task_executions',
	});

	return result;
}

/**
 * Get execution history for a specific task.
 *
 * @param taskName - Name of task
 * @param limitCount - Maximum entries to return (default: 20)
 * @returns Array of execution history entries
 */
function getTaskHistory(
	taskName: string,
	limitCount = 20
): {
	completedAt: null | string;
	createdAt: string;
	durationMs: null | number;
	error: null | string;
	id: number;
	startedAt: string;
	status: string;
	taskName: string;
}[] {
	const db = getDb();

	const rows = db
		.select()
		.from(scheduledTaskExecutions)
		.where(eq(scheduledTaskExecutions.taskName, taskName))
		.orderBy(desc(scheduledTaskExecutions.createdAt))
		.limit(limitCount)
		.all();

	return rows.map((row) => {
		const safe = (d: Date | null | undefined): null | string =>
			d && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
		return {
			completedAt: safe(row.completedAt),
			createdAt: safe(row.createdAt) ?? new Date(0).toISOString(),
			durationMs: row.durationMs,
			error: row.error,
			id: row.id,
			startedAt: safe(row.startedAt) ?? new Date(0).toISOString(),
			status: row.status,
			taskName: row.taskName,
		};
	});
}

export { executeTask, getTaskHistory, triggerTask };
