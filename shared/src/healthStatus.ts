/**
 * Health check status identifiers and alert severities. The const arrays are the
 * runtime source of truth; the literal union types are derived from them so the
 * list and type cannot drift.
 *
 * Add a new status/severity by appending to the relevant array — the Drizzle
 * schema enum (SQLite + PostgreSQL) and the frontend API types both reference
 * these constants.
 */

const HEALTH_STATUSES = ['healthy', 'degraded', 'unhealthy'] as const;

type HealthStatus = (typeof HEALTH_STATUSES)[number];

const HEALTH_ALERT_SEVERITIES = ['warn', 'critical'] as const;

type HealthAlertSeverity = (typeof HEALTH_ALERT_SEVERITIES)[number];

export { HEALTH_ALERT_SEVERITIES, HEALTH_STATUSES };
export type { HealthAlertSeverity, HealthStatus };
