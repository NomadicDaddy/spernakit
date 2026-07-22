import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	INTERNAL_ERROR_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';

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

const acknowledgeAlertDocs = {
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
};

const resolveAlertDocs = {
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
};

const getHealthConfigDocs = {
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
						default: dataExample('Health check configuration', HEALTH_CONFIG_EXAMPLE),
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
};

const updateHealthConfigDocs = {
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
};

const cleanupAlertsDocs = {
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
};

export {
	acknowledgeAlertDocs,
	cleanupAlertsDocs,
	getHealthConfigDocs,
	resolveAlertDocs,
	updateHealthConfigDocs,
};
