import { Type } from '../configSchemaHelpers';

const retentionDays = Type.Integer({ minimum: 1 });

export const retentionSchema = Type.Object({
	auditLogsDays: retentionDays,
	businessEventsDays: retentionDays,
	healthCheckAlertsDays: retentionDays,
	healthCheckLogsDays: retentionDays,
	notificationsDays: retentionDays,
	scheduledTaskExecutionsDays: retentionDays,
	softDeletedFilesDays: retentionDays,
	systemMetricsDays: retentionDays,
});
