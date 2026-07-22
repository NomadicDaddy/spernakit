/**
 * Health Service — Facade.
 *
 * Re-exports public API from the health/ subdirectory.
 * No business logic belongs in this file.
 */
export { createAlertAndNotify } from './health/healthAlertCreationService.ts';
export { acknowledgeAlert, getActiveAlerts, resolveAlert } from './health/healthAlertService.ts';
export { runAllChecks, runAndStoreChecks, runAndStoreSingleCheck } from './health/healthChecks.ts';
export { invalidateHealthCache } from './health/healthChecks.ts';
export { getHealthConfig, updateHealthConfig } from './health/healthConfigService.ts';
export {
	cleanupOldLogs,
	cleanupStaleAlerts,
	getCheckHistory,
} from './health/healthHistoryService.ts';
export { getLastIntegrityCheck } from './health/healthIntegrityService.ts';
