import { Elysia, t } from 'elysia';

const HealthAlertIdSchema = t.Object({
	id: t.Numeric({ minimum: 1 }),
});

import { WS_CRUD_EVENTS } from 'spernakit-shared';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	INTERNAL_ERROR_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, requireRoleFresh } from '../../guards/role.ts';
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

const ALERT_EXAMPLE = {
	acknowledgedAt: '2026-01-15T10:35:00Z',
	acknowledgedBy: 1,
	checkType: 'memory',
	createdAt: '2026-01-15T10:30:00Z',
	id: 1,
	message: 'Memory usage above 80%',
	resolvedAt: null,
	severity: 'warning',
};

const HEALTH_CONFIG_EXAMPLE = {
	alertsEnabled: true,
	alertThreshold: 'degraded',
	diskSpaceDegradedThreshold: 0.2,
	diskSpaceUnhealthyThreshold: 0.05,
	enabled: { database: true, disk: true, filesystem: true, memory: true },
	logRetentionDays: 30,
	memoryHeapDegradedThreshold: 0.85,
	memoryHeapUnhealthyThreshold: 0.95,
};

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
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Marks a health check alert as acknowledged by the current user. ' +
					'Sets acknowledgedAt timestamp and acknowledgedBy user ID. ' +
					'Acknowledged alerts are still displayed in System Health UI but ' +
					'marked as acknowledged. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Alert acknowledged', ALERT_EXAMPLE),
								},
							},
						},
						description: 'Acknowledged alert with updated timestamps.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': {
						description: 'Alert not found.',
					},
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Acknowledge health check alert (ADMIN+)',
			},
			params: HealthAlertIdSchema,
		}
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
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Marks a health check alert as resolved. Sets resolvedAt ' +
					'timestamp. Resolved alerts are no longer displayed in active alerts ' +
					'list. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Alert resolved', {
										...ALERT_EXAMPLE,
										resolvedAt: '2026-01-15T10:40:00Z',
									}),
								},
							},
						},
						description: 'Resolved alert with resolved timestamp.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': {
						description: 'Alert not found.',
					},
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Resolve health check alert (ADMIN+)',
			},
			params: HealthAlertIdSchema,
		}
	)
	.get(
		'/config',
		() => {
			return dataResponse(getHealthConfig());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Retrieve health check configuration including thresholds, enabled ' +
					'checks, and log retention policy. Configuration is stored in ' +
					'settings table with key "health_check_config". Requires ADMIN ' +
					'role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									default: dataExample(
										'Health check configuration',
										HEALTH_CONFIG_EXAMPLE
									),
								},
							},
						},
						description: 'Health check configuration.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Get health check configuration (ADMIN+)',
			},
		}
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
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Object(
				{
					alertsEnabled: t.Optional(t.Boolean()),
					alertThreshold: t.Optional(
						t.Union([t.Literal('degraded'), t.Literal('unhealthy')])
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
							})
						)
					),
					logRetentionDays: t.Optional(t.Number({ maximum: 3650, minimum: 1 })),
					memoryHeapDegradedThreshold: t.Optional(t.Number({ maximum: 1, minimum: 0 })),
					memoryHeapUnhealthyThreshold: t.Optional(t.Number({ maximum: 1, minimum: 0 })),
				},
				{
					description: 'Health check configuration updates',
				}
			),
			detail: {
				description:
					'Update health check configuration including thresholds, enabled ' +
					'checks, and log retention policy. Threshold values are applied ' +
					'immediately without service restart. All changes are logged in ' +
					'audit trail. Requires SYSOP role.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									updated: dataExample('Configuration updated', {
										...HEALTH_CONFIG_EXAMPLE,
										alertThreshold: 'unhealthy',
										logRetentionDays: 60,
									}),
								},
							},
						},
						description: 'Updated health check configuration.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Update health check configuration (SYSOP only)',
			},
		}
	)
	.post(
		'/alerts/cleanup',
		() => {
			const result = cleanupStaleAlerts();
			return dataResponse({ batches: result.batches, resolved: result.cleaned });
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Resolve stale health check alerts (alerts active longer than ' +
					'logRetentionDays). Marks old alerts as resolved in bounded batches ' +
					'to clear them from active alerts view without long write locks. ' +
					'Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Stale alerts resolved', {
										batches: 1,
										resolved: 12,
									}),
								},
							},
						},
						description: 'Number of alerts resolved and batches executed.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'500': INTERNAL_ERROR_EXAMPLE,
				},
				summary: 'Resolve stale health check alerts (ADMIN+)',
			},
		}
	);

export { healthAlertsConfigRoutes };
