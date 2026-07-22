import { eq } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { scheduledTaskConfigs } from '../../db/schema/scheduledTasks.ts';
import { logScheduler } from '../../utils/logger.ts';
import { log as logAudit } from '../auditService.ts';

interface TaskConfigOverride {
	cronExpression: string;
	enabled: boolean;
}

/**
 * Load all persisted task config overrides from the database.
 *
 * @returns Map keyed by task name
 */
function loadConfigOverrides(): Map<string, TaskConfigOverride> {
	const db = getDb();
	const rows = db.select().from(scheduledTaskConfigs).all();
	const overrides = new Map<string, TaskConfigOverride>();
	for (const row of rows) {
		overrides.set(row.taskName, {
			cronExpression: row.cronExpression,
			enabled: row.enabled,
		});
	}
	return overrides;
}

/**
 * Save a task config override to the database (upsert by task name).
 *
 * @param taskName - Registered task name
 * @param config - Override values to persist
 */
function saveConfigOverride(taskName: string, config: TaskConfigOverride): void {
	const db = getDb();
	const existing = db
		.select({ id: scheduledTaskConfigs.id })
		.from(scheduledTaskConfigs)
		.where(eq(scheduledTaskConfigs.taskName, taskName))
		.get();

	if (existing) {
		db.update(scheduledTaskConfigs)
			.set({
				cronExpression: config.cronExpression,
				enabled: config.enabled,
				updatedAt: new Date(),
			})
			.where(eq(scheduledTaskConfigs.id, existing.id))
			.run();
	} else {
		db.insert(scheduledTaskConfigs)
			.values({
				cronExpression: config.cronExpression,
				enabled: config.enabled,
				taskName,
			})
			.run();
	}

	logScheduler('info', 'Saved task config override', {
		cronExpression: config.cronExpression,
		enabled: config.enabled,
		taskName,
	});

	logAudit({
		action: 'TASK_CONFIG_UPDATE',
		details: {
			cronExpression: config.cronExpression,
			enabled: config.enabled,
			taskName,
		},
		entityType: 'scheduled_task_configs',
	});
}

export { loadConfigOverrides, saveConfigOverride };
export type { TaskConfigOverride };
