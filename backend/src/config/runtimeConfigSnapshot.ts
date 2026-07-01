import { getConfig } from './configLoader.ts';

/**
 * Placeholder rendered in place of any redacted secret value. Matches the
 * project-wide convention used by services/database-admin/redaction.ts.
 */
const REDACTED = '[REDACTED]';

/** Marker for a secret slot that is currently unset (operationally useful, leaks nothing). */
const NOT_SET = '(not set)';

/** Recursive value type for the read-only runtime configuration snapshot. */
type SnapshotValue = { [key: string]: SnapshotValue } | boolean | number | SnapshotValue[] | string;

/** A single named section of the snapshot (e.g. `server`, `database`). */
type ConfigSection = Record<string, SnapshotValue>;

/** The full redacted snapshot: a map of section name to its read-only fields. */
type RuntimeConfigSnapshot = Record<string, ConfigSection>;

/** Report whether a secret string is configured without revealing its value. */
function presence(value: string | undefined): string {
	return value ? REDACTED : NOT_SET;
}

/** Replace every header value with the redaction placeholder, preserving key names. */
function redactHeaderValues(headers: Record<string, string>): Record<string, string> {
	const result: Record<string, string> = {};
	for (const key of Object.keys(headers)) {
		result[key] = REDACTED;
	}
	return result;
}

/**
 * Build a redacted, read-only snapshot of the effective runtime configuration.
 *
 * The single source of truth is the validated config singleton from
 * `getConfig()` — this never re-reads config files, so it cannot become a
 * second source of config truth. Only operationally useful, non-secret fields
 * are whitelisted into the snapshot; the security, oauth, email, apiKeys,
 * roles, dashboards and testing sections are excluded entirely.
 * Remaining secret-bearing leaves (database URL, S3 credentials, alerting
 * webhook secret and headers) are masked with `[REDACTED]`.
 */
function getRedactedConfigSnapshot(): RuntimeConfigSnapshot {
	const c = getConfig();

	return {
		alerting: {
			cooldownMinutes: c.alerting.cooldownMinutes,
			email: {
				enabled: c.alerting.email.enabled,
				recipients: c.alerting.email.recipients,
			},
			inApp: { enabled: c.alerting.inApp.enabled },
			webhook: {
				enabled: c.alerting.webhook.enabled,
				headers: redactHeaderValues(c.alerting.webhook.headers),
				secret: presence(c.alerting.webhook.secret),
				timeoutMs: c.alerting.webhook.timeoutMs,
				url: c.alerting.webhook.url,
			},
		},
		app: {
			description: c.app.description,
			name: c.app.name,
			slug: c.app.slug,
		},
		audit: {
			enabled: c.audit.enabled,
			ipWhitelist: c.audit.ipWhitelist,
		},
		cors: {
			allowedOrigins: c.cors.allowedOrigins,
			allowNoOrigin: c.cors.allowNoOrigin,
			frontendDevOrigins: c.cors.frontendDevOrigins,
			inheritFrontendUrl: c.cors.inheritFrontendUrl,
		},
		database: {
			allowDbPush: c.database.allowDbPush,
			backup: {
				compress: c.database.backup.compress,
				enabled: c.database.backup.enabled,
				encrypt: c.database.backup.encrypt,
				intervalHours: c.database.backup.intervalHours,
				location: c.database.backup.location,
				retentionDays: c.database.backup.retentionDays,
			},
			busyTimeoutMs: c.database.busyTimeoutMs,
			dialect: c.database.dialect,
			integrityCheck: {
				enabled: c.database.integrityCheck.enabled,
				intervalHours: c.database.integrityCheck.intervalHours,
				mode: c.database.integrityCheck.mode,
			},
			ssl: {
				enabled: c.database.ssl.enabled,
				rejectUnauthorized: c.database.ssl.rejectUnauthorized,
			},
			// Connection string embeds credentials — always masked.
			url: REDACTED,
			vacuum: {
				enabled: c.database.vacuum.enabled,
				intervalHours: c.database.vacuum.intervalHours,
			},
		},
		databaseAdmin: {
			enabled: c.databaseAdmin.enabled,
		},
		healthCheck: {
			enabled: c.healthCheck.enabled,
			interval: c.healthCheck.interval,
			retentionDays: c.healthCheck.retentionDays,
			thresholds: {
				auth: c.healthCheck.thresholds.auth,
				db: c.healthCheck.thresholds.db,
				fs: c.healthCheck.thresholds.fs,
				memory: c.healthCheck.thresholds.memory,
			},
		},
		logging: {
			file: {
				enabled: c.logging.file.enabled,
				maxFiles: c.logging.file.maxFiles,
				maxSize: c.logging.file.maxSize,
				path: c.logging.file.path,
			},
			level: c.logging.level,
		},
		metrics: {
			collectionIntervalMs: c.metrics.collectionIntervalMs,
		},
		rateLimit: {
			authEnabled: c.rateLimit.authEnabled,
			backend: c.rateLimit.backend,
			enabled: c.rateLimit.enabled,
			maxRequests: c.rateLimit.maxRequests,
			windowMs: c.rateLimit.windowMs,
		},
		retention: {
			auditLogsDays: c.retention.auditLogsDays,
			businessEventsDays: c.retention.businessEventsDays,
			healthCheckAlertsDays: c.retention.healthCheckAlertsDays,
			healthCheckLogsDays: c.retention.healthCheckLogsDays,
			notificationsDays: c.retention.notificationsDays,
			scheduledTaskExecutionsDays: c.retention.scheduledTaskExecutionsDays,
			softDeletedFilesDays: c.retention.softDeletedFilesDays,
			systemMetricsDays: c.retention.systemMetricsDays,
		},
		server: {
			backendPort: c.server.backendPort,
			backendUrl: c.server.backendUrl,
			frontendPort: c.server.frontendPort,
			frontendUrl: c.server.frontendUrl,
			host: c.server.host,
			maxRequestBodySize: c.server.maxRequestBodySize,
			nodeEnv: c.server.nodeEnv,
			timezone: c.server.timezone,
			trustedProxies: c.server.trustedProxies,
			trustProxy: c.server.trustProxy,
		},
		storage: {
			adapter: c.storage.adapter,
			allowedMimeTypes: c.storage.allowedMimeTypes,
			maxFileSize: c.storage.maxFileSize,
			s3: {
				// Access key id and secret are storage credentials — masked.
				accessKeyId: presence(c.storage.s3.accessKeyId),
				bucket: c.storage.s3.bucket,
				endpoint: c.storage.s3.endpoint,
				region: c.storage.s3.region,
				secretAccessKey: presence(c.storage.s3.secretAccessKey),
			},
		},
		tokenCleanup: {
			enabled: c.tokenCleanup.enabled,
			intervalHours: c.tokenCleanup.intervalHours,
			minimumIntervalHours: c.tokenCleanup.minimumIntervalHours,
		},
		websocket: {
			maxConnectionsPerIp: c.websocket.maxConnectionsPerIp,
			maxConnectionsPerUser: c.websocket.maxConnectionsPerUser,
			maxPayload: c.websocket.maxPayload,
			rateLimitWindow: c.websocket.rateLimitWindow,
		},
	};
}

export { getRedactedConfigSnapshot };
export type { ConfigSection, RuntimeConfigSnapshot, SnapshotValue };
