import { desc, eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { scheduledTaskExecutions } from '../../db/schema/scheduledTasks.ts';
import { logScheduler } from '../../utils/logger.ts';
import { loadConfigOverrides } from './schedulerConfigService.ts';
import { executeTask } from './schedulerExecutor.ts';
import { applyConfigOverrides, parseInterval, tasks } from './schedulerRegistry.ts';

const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
const runningTasks = new Set<string>();

/**
 * Schedule a single task tick using wall-clock-aligned setTimeout.
 * After each execution, the next timeout is computed from the current wall clock
 * to prevent cumulative drift that setInterval causes.
 *
 * @param name - Task name
 * @param intervalMs - Interval in milliseconds
 */
function scheduleNextTick(name: string, intervalMs: number): void {
	const handle = setTimeout(() => {
		if (runningTasks.has(name)) {
			logScheduler('warn', 'Skipping overlapping task execution', { name });
			scheduleNextTick(name, intervalMs);
			return;
		}
		runningTasks.add(name);
		executeTask(name)
			.catch((err: unknown) => {
				logScheduler('error', 'Scheduled task execution error', { error: err, name });
			})
			.finally(() => {
				runningTasks.delete(name);
				scheduleNextTick(name, intervalMs);
			});
	}, intervalMs);

	timeouts.set(name, handle);
}

/**
 * Mark any execution records left in 'running' status as failed.
 * This handles the case where the process crashed mid-execution.
 */
function cleanupOrphanedExecutions(): void {
	const db = getDb();
	const orphaned = db
		.select({ id: scheduledTaskExecutions.id, taskName: scheduledTaskExecutions.taskName })
		.from(scheduledTaskExecutions)
		.where(eq(scheduledTaskExecutions.status, 'running'))
		.all();

	if (orphaned.length === 0) return;

	for (const record of orphaned) {
		db.update(scheduledTaskExecutions)
			.set({
				completedAt: new Date(),
				error: 'Orphaned by process crash — marked failed on restart',
				status: 'failed',
			})
			.where(eq(scheduledTaskExecutions.id, record.id))
			.run();
	}

	logScheduler('warn', 'Cleaned up orphaned task executions', {
		count: orphaned.length,
		taskNames: orphaned.map((r) => r.taskName),
	});
}

/**
 * Check if any enabled tasks missed their scheduled window during downtime.
 * If the last execution was longer ago than the task interval, run immediately.
 */
async function runMissedTasks(): Promise<void> {
	const db = getDb();
	const now = Date.now();
	const pending: Promise<unknown>[] = [];

	for (const [name, task] of tasks) {
		if (!task.enabled) continue;

		let intervalMs: number;
		try {
			intervalMs = parseInterval(task.cronExpression);
		} catch (err) {
			logScheduler('warn', 'Invalid cron expression — skipping missed-task check', {
				cronExpression: task.cronExpression,
				error: err instanceof Error ? err.message : String(err),
				name,
			});
			continue;
		}
		if (intervalMs <= 0) continue;

		const lastExec = db
			.select({ completedAt: scheduledTaskExecutions.completedAt })
			.from(scheduledTaskExecutions)
			.where(eq(scheduledTaskExecutions.taskName, name))
			.orderBy(desc(scheduledTaskExecutions.createdAt))
			.limit(1)
			.get();

		const lastCompletedMs = lastExec?.completedAt?.getTime() ?? 0;
		const elapsed = now - lastCompletedMs;

		if (elapsed >= intervalMs) {
			logScheduler('info', 'Running missed task after restart', {
				elapsedMs: elapsed,
				intervalMs,
				name,
			});
			runningTasks.add(name);
			pending.push(
				executeTask(name)
					.catch((err: unknown) => {
						logScheduler('error', 'Missed task execution error', { error: err, name });
					})
					.finally(() => {
						runningTasks.delete(name);
					})
			);
		}
	}

	await Promise.allSettled(pending);
}

/**
 * Initialize the scheduler, starting wall-clock-aligned timeouts for enabled tasks.
 * On startup: cleans up orphaned executions, runs missed tasks, then starts scheduling.
 */
async function initializeScheduler(): Promise<void> {
	applyConfigOverrides(loadConfigOverrides());
	cleanupOrphanedExecutions();
	await runMissedTasks();

	for (const [name, task] of tasks) {
		if (!task.enabled) continue;

		let intervalMs: number;
		try {
			intervalMs = parseInterval(task.cronExpression);
		} catch (err) {
			logScheduler('warn', 'Invalid cron expression', {
				cronExpression: task.cronExpression,
				error: err instanceof Error ? err.message : String(err),
				name,
			});
			continue;
		}

		if (intervalMs <= 0) {
			logScheduler('warn', 'Invalid cron expression', {
				cronExpression: task.cronExpression,
				name,
			});
			continue;
		}

		scheduleNextTick(name, intervalMs);
		logScheduler('info', 'Started scheduled task', { intervalMs, name });
	}
}

/**
 * Stop the scheduler, clearing all active timeouts.
 */
function stopScheduler(): void {
	for (const [name, handle] of timeouts) {
		clearTimeout(handle);
		logScheduler('info', 'Stopped scheduled task', { name });
	}
	timeouts.clear();
}

/**
 * Reschedule a single task at runtime.
 * Clears any existing timeout and starts a new one if the task is enabled.
 * Called after an admin updates a task's config.
 *
 * @param name - Registered task name
 */
function rescheduleTask(name: string): void {
	// Clear existing timeout
	const existing = timeouts.get(name);
	if (existing) {
		clearTimeout(existing);
		timeouts.delete(name);
		logScheduler('info', 'Cleared existing timeout for reschedule', { name });
	}

	const task = tasks.get(name);
	if (!task) return;

	if (!task.enabled) {
		logScheduler('info', 'Task disabled, not rescheduling', { name });
		return;
	}

	let intervalMs: number;
	try {
		intervalMs = parseInterval(task.cronExpression);
	} catch (err) {
		logScheduler('warn', 'Invalid cron expression during reschedule', {
			cronExpression: task.cronExpression,
			error: err instanceof Error ? err.message : String(err),
			name,
		});
		return;
	}

	scheduleNextTick(name, intervalMs);
	logScheduler('info', 'Rescheduled task', { intervalMs, name });
}

export { initializeScheduler, rescheduleTask, stopScheduler };
