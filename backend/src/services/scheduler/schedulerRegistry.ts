import { sql } from 'drizzle-orm';

import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '../../constants/scheduler.ts';
import { getDb } from '../../db/index.ts';
import { scheduledTaskExecutions } from '../../db/schema/scheduledTasks.ts';
import { logScheduler } from '../../utils/logger.ts';

interface TaskDefinition {
	cronExpression: string;
	enabled: boolean;
	handler: () => Promise<unknown> | unknown;
	name: string;
}

interface TaskInfo {
	cronExpression: string;
	enabled: boolean;
	lastExecution: {
		completedAt: null | string;
		durationMs: null | number;
		error: null | string;
		startedAt: string;
		status: string;
	} | null;
	name: string;
}

const tasks = new Map<string, TaskDefinition>();

/**
 * Register a scheduled task.
 * Throws if a task with the same name is already registered.
 *
 * @param definition - Task name, cron expression, enabled flag, and handler
 */
function registerTask(definition: TaskDefinition): void {
	if (tasks.has(definition.name)) {
		throw new Error(
			`Scheduled task "${definition.name}" is already registered. Duplicate task names are not allowed.`
		);
	}
	tasks.set(definition.name, definition);
	logScheduler('info', 'Registered scheduled task', {
		enabled: definition.enabled,
		name: definition.name,
	});
}

/**
 * Get list of all registered tasks with their last execution info.
 * Uses a single query with ROW_NUMBER() window function to avoid N+1 queries.
 *
 * @returns Array of task info objects
 */
function getTaskList(): TaskInfo[] {
	const db = getDb();
	const taskNames = [...tasks.keys()];

	if (taskNames.length === 0) return [];

	const latestExecutions = db
		.select()
		.from(scheduledTaskExecutions)
		.where(
			sql`${scheduledTaskExecutions.taskName} IN ${taskNames} AND ${scheduledTaskExecutions.id} IN (
				SELECT id FROM (
					SELECT id, ROW_NUMBER() OVER (
						PARTITION BY ${scheduledTaskExecutions.taskName}
						ORDER BY ${scheduledTaskExecutions.createdAt} DESC
					) AS rn
					FROM ${scheduledTaskExecutions}
					WHERE ${scheduledTaskExecutions.taskName} IN ${taskNames}
				) WHERE rn = 1
			)`
		)
		.all();

	const execByName = new Map(latestExecutions.map((exec) => [exec.taskName, exec]));

	const result: TaskInfo[] = [];
	for (const [name, task] of tasks) {
		const lastExec = execByName.get(name);
		result.push({
			cronExpression: task.cronExpression,
			enabled: task.enabled,
			lastExecution: lastExec
				? {
						completedAt:
							lastExec.completedAt && !Number.isNaN(lastExec.completedAt.getTime())
								? lastExec.completedAt.toISOString()
								: null,
						durationMs: lastExec.durationMs,
						error: lastExec.error,
						startedAt:
							lastExec.startedAt && !Number.isNaN(lastExec.startedAt.getTime())
								? lastExec.startedAt.toISOString()
								: new Date(0).toISOString(),
						status: lastExec.status,
					}
				: null,
			name,
		});
	}

	return result;
}

/**
 * Parse a simple cron-like interval to milliseconds.
 * Supports: "6h", "24h", "30m", "10000ms", "10s", or raw ms number.
 * Throws on invalid expressions instead of returning NaN.
 *
 * @param expression - Cron-like expression
 * @returns Interval in milliseconds
 * @throws Error if expression cannot be parsed
 */
const SUFFIX_MULTIPLIERS: Record<string, number> = {
	d: MS_PER_DAY,
	h: MS_PER_HOUR,
	m: MS_PER_MINUTE,
	ms: 1,
	s: 1000,
};

function parseInterval(expression: string): number {
	const match = /^(\d+)(ms|[dhms])$/.exec(expression);
	let result: number;
	if (match) {
		const multiplier = SUFFIX_MULTIPLIERS[match[2] ?? ''] ?? 1;
		result = Number(match[1]) * multiplier;
	} else if (/^\d+$/.test(expression.trim())) {
		// Bare numeric string (raw milliseconds)
		result = Number(expression.trim());
	} else {
		throw new Error(
			`Invalid scheduler interval expression: "${expression}". Expected format: "6h", "30m", "10s", "5000ms", "1d", or a raw millisecond number.`
		);
	}

	if (result <= 0) {
		throw new Error(`Invalid interval: must be positive, got ${result}ms from "${expression}"`);
	}
	return result;
}

/**
 * Apply persisted config overrides to registered tasks.
 * Called once after all tasks are registered, before the scheduler starts.
 *
 * @param overrides - Map of task name to config override
 */
function applyConfigOverrides(
	overrides: Map<string, { cronExpression: string; enabled: boolean }>
): void {
	for (const [name, override] of overrides) {
		const task = tasks.get(name);
		if (!task) continue;
		task.cronExpression = override.cronExpression;
		task.enabled = override.enabled;
		logScheduler('info', 'Applied config override', {
			cronExpression: override.cronExpression,
			enabled: override.enabled,
			name,
		});
	}
}

/**
 * Update a task's in-memory config (cronExpression and/or enabled).
 *
 * @param name - Registered task name
 * @param updates - Fields to update
 * @param updates.cronExpression - New schedule expression
 * @param updates.enabled - New enabled state
 * @returns Updated task definition, or null if the task doesn't exist
 */
function updateTaskConfig(
	name: string,
	updates: { cronExpression?: string; enabled?: boolean }
): null | TaskDefinition {
	const task = tasks.get(name);
	if (!task) return null;
	if (updates.cronExpression !== undefined) {
		task.cronExpression = updates.cronExpression;
	}
	if (updates.enabled !== undefined) {
		task.enabled = updates.enabled;
	}
	return task;
}

export { applyConfigOverrides, getTaskList, parseInterval, registerTask, tasks, updateTaskConfig };
export type { TaskDefinition, TaskInfo };
