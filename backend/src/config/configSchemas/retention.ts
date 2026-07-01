import { z } from 'zod';

const retentionDays = z.number().int().min(1, 'Retention period must be at least 1 day');

export const retentionSchema = z.object({
	auditLogsDays: retentionDays,
	businessEventsDays: retentionDays,
	healthCheckAlertsDays: retentionDays,
	healthCheckLogsDays: retentionDays,
	notificationsDays: retentionDays,
	scheduledTaskExecutionsDays: retentionDays,
	softDeletedFilesDays: retentionDays,
	systemMetricsDays: retentionDays,
});
