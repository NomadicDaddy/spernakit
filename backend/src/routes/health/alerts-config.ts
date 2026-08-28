import { Elysia, t } from 'elysia';
import { WS_CRUD_EVENTS } from 'spernakit-shared';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import {
	acknowledgeAlert,
	cleanupStaleAlerts,
	getHealthConfig,
	resolveAlert,
	updateHealthConfig,
} from '../../services/healthService.ts';
import { broadcastCrudToAdmins } from '../../services/websocketService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { badRequestError, extractErrorMessage, notFoundError } from '../../utils/errorResponse.ts';
import {
	acknowledgeAlertDocs,
	cleanupAlertsDocs,
	getHealthConfigDocs,
	resolveAlertDocs,
	updateHealthConfigDocs,
} from './alerts-config.docs.ts';

const HealthAlertIdSchema = t.Object({
	id: t.Numeric({ minimum: 1 }),
});

const healthAlertsConfigRoutes = new Elysia({
	detail: { tags: ['Health'] },
	prefix: '/health',
})
	.use(authPlugin)
	.post(
		'/alerts/:id/acknowledge',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			const alertId = Number(params.id);
			const result = acknowledgeAlert(alertId, authUser.id);
			if (!result) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Alert');
			}
			broadcastCrudToAdmins(WS_CRUD_EVENTS.HEALTH_ALERT_UPDATED, { id: alertId });
			return dataResponse(result);
		},
		{
			detail: acknowledgeAlertDocs,
			params: HealthAlertIdSchema,
			requireRole: 'ADMIN',
		},
	)
	.post(
		'/alerts/:id/resolve',
		({ params, set }) => {
			const alertId = Number(params.id);
			const result = resolveAlert(alertId);
			if (!result) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Alert');
			}
			broadcastCrudToAdmins(WS_CRUD_EVENTS.HEALTH_ALERT_UPDATED, { id: alertId });
			return dataResponse(result);
		},
		{
			detail: resolveAlertDocs,
			params: HealthAlertIdSchema,
			requireRole: 'ADMIN',
		},
	)
	.get(
		'/config',
		() => {
			return dataResponse(getHealthConfig());
		},
		{
			detail: getHealthConfigDocs,
			requireRole: 'ADMIN',
		},
	)
	.put(
		'/config',
		({ body, set, user }) => {
			const authUser = assertUser(user);
			try {
				const config = updateHealthConfig(body, authUser.id);
				broadcastCrudToAdmins(WS_CRUD_EVENTS.HEALTH_CONFIG_UPDATED, {});
				return dataResponse(config);
			} catch (err) {
				set.status = HTTP_STATUS.BAD_REQUEST;
				return badRequestError(extractErrorMessage(err, 'Invalid configuration'));
			}
		},
		{
			body: t.Object(
				{
					alertsEnabled: t.Optional(t.Boolean()),
					alertThreshold: t.Optional(
						t.Union([t.Literal('degraded'), t.Literal('unhealthy')]),
					),
					diskSpaceDegradedThreshold: t.Optional(t.Number({ maximum: 1, minimum: 0 })),
					diskSpaceUnhealthyThreshold: t.Optional(t.Number({ maximum: 1, minimum: 0 })),
					enabled: t.Optional(
						t.Record(
							t.String({ maxLength: 50 }),
							t.Boolean({
								default: {
									database: true,
									disk: true,
									filesystem: true,
									memory: true,
								},
							}),
						),
					),
					logRetentionDays: t.Optional(t.Number({ maximum: 3650, minimum: 1 })),
					memoryHeapDegradedThreshold: t.Optional(t.Number({ maximum: 1, minimum: 0 })),
					memoryHeapUnhealthyThreshold: t.Optional(t.Number({ maximum: 1, minimum: 0 })),
				},
				{
					description: 'Health check configuration updates',
				},
			),
			detail: updateHealthConfigDocs,
			requireRole: 'SYSOP',
		},
	)
	.post(
		'/alerts/cleanup',
		() => {
			const result = cleanupStaleAlerts();
			return dataResponse({ batches: result.batches, resolved: result.cleaned });
		},
		{
			detail: cleanupAlertsDocs,
			requireRole: 'ADMIN',
		},
	);

export { healthAlertsConfigRoutes };
