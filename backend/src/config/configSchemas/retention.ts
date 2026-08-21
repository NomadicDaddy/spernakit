import { Type } from '../configSchemaHelpers';

/**
 * Days to keep rows before the matching cleanup task hard-deletes them. `0` disables the purge for
 * that table: the task runs, logs that retention is off, and deletes nothing. Every consumer must
 * check `isRetentionDisabled()` before computing a cutoff — a zero fed straight into `cutoffDate()`
 * would be a cutoff of "now", which is the opposite of keeping everything.
 *
 * Two keys are narrower than their names suggest, and say so in their own descriptions:
 * `healthCheckLogsDays` is not read by any cleanup task (health-check log retention comes from the
 * Health settings stored in the database, minimum 1 day), and `systemMetricsDays` governs `system`
 * snapshots only — web-vital rows keep a fixed window (`WEB_VITALS_RETENTION_DAYS`) regardless.
 */
const retentionDays = Type.Integer({
	description: 'Days to retain rows before hard delete; 0 disables purging (keep forever).',
	minimum: 0,
});

export const retentionSchema = Type.Object({
	auditLogsDays: retentionDays,
	businessEventsDays: retentionDays,
	healthCheckAlertsDays: retentionDays,
	healthCheckLogsDays: Type.Integer({
		description:
			'Reserved; not read by the cleanup tasks. Health-check log retention is set from the Health ' +
			'settings page (`logRetentionDays`, stored in the database, minimum 1 day), so 0 here does ' +
			'not keep health-check logs forever.',
		minimum: 0,
	}),
	notificationsDays: retentionDays,
	scheduledTaskExecutionsDays: retentionDays,
	softDeletedFilesDays: retentionDays,
	systemMetricsDays: Type.Integer({
		description:
			'Days to retain `system` metric snapshots; 0 disables purging (keep forever). Web-vital ' +
			'rows are not covered: they keep a fixed 7-day window regardless of this value.',
		minimum: 0,
	}),
});
