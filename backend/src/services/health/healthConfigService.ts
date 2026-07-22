import { Type, enumString } from '../../config/configSchemaHelpers.ts';
import {
	ALERT_THRESHOLDS,
	DISK_SPACE_DEGRADED_THRESHOLD,
	DISK_SPACE_UNHEALTHY_THRESHOLD,
	HEALTH_CHECK_LOG_RETENTION_DAYS as DEFAULT_LOG_RETENTION_DAYS,
	MEMORY_HEAP_DEGRADED_THRESHOLD,
	MEMORY_HEAP_UNHEALTHY_THRESHOLD,
} from '../../constants/health.ts';
import { parseSettingsJson } from '../../utils/validation.ts';
import { getByKeyRaw, seedDefault, update } from '../settingsService.ts';

const HealthCheckConfigSchema = Type.Object({
	alertsEnabled: Type.Optional(Type.Boolean()),
	alertThreshold: Type.Optional(enumString(['degraded', 'unhealthy'])),
	diskSpaceDegradedThreshold: Type.Optional(Type.Number()),
	diskSpaceUnhealthyThreshold: Type.Optional(Type.Number()),
	enabled: Type.Optional(Type.Record(Type.String(), Type.Boolean())),
	logRetentionDays: Type.Optional(Type.Number()),
	memoryHeapDegradedThreshold: Type.Optional(Type.Number()),
	memoryHeapUnhealthyThreshold: Type.Optional(Type.Number()),
});

interface HealthCheckConfig {
	alertsEnabled: boolean;
	alertThreshold: 'degraded' | 'unhealthy';
	diskSpaceDegradedThreshold: number;
	diskSpaceUnhealthyThreshold: number;
	enabled: Record<string, boolean>;
	logRetentionDays: number;
	memoryHeapDegradedThreshold: number;
	memoryHeapUnhealthyThreshold: number;
}

interface Thresholds {
	diskSpaceDegradedThreshold: number;
	diskSpaceUnhealthyThreshold: number;
	memoryHeapDegradedThreshold: number;
	memoryHeapUnhealthyThreshold: number;
}

const DEFAULT_CONFIG: HealthCheckConfig = {
	alertsEnabled: true,
	alertThreshold: 'degraded',
	diskSpaceDegradedThreshold: DISK_SPACE_DEGRADED_THRESHOLD,
	diskSpaceUnhealthyThreshold: DISK_SPACE_UNHEALTHY_THRESHOLD,
	enabled: {
		database: true,
		disk: true,
		filesystem: true,
		memory: true,
	},
	logRetentionDays: DEFAULT_LOG_RETENTION_DAYS,
	memoryHeapDegradedThreshold: MEMORY_HEAP_DEGRADED_THRESHOLD,
	memoryHeapUnhealthyThreshold: MEMORY_HEAP_UNHEALTHY_THRESHOLD,
};

const HEALTH_CONFIG_KEY = 'health_check_config';

/** Callbacks invoked when config changes, to invalidate dependent caches */
const onConfigChangedListeners: (() => void)[] = [];

/**
 * Register a callback to be invoked when health config is updated.
 * Used to invalidate the health check cache without a circular import.
 *
 * @param callback - Function to call on config change
 */
function onHealthConfigChange(callback: () => void): void {
	onConfigChangedListeners.push(callback);
}

/**
 * Get the default health check config.
 * Used for seeding and type reference.
 *
 * @returns A copy of the default health check configuration
 */
function getDefaultHealthConfig(): HealthCheckConfig {
	return { ...DEFAULT_CONFIG };
}

/**
 * Ensure health check config exists in database (seed if not).
 * This ensures the database is the single source of truth.
 */
function ensureHealthConfigSeeded(): void {
	seedDefault(
		HEALTH_CONFIG_KEY,
		DEFAULT_CONFIG,
		'Health check configuration thresholds and settings'
	);
}

function parseConfig(value: null | string): HealthCheckConfig {
	if (!value) return getDefaultHealthConfig();

	const parsed = parseSettingsJson(
		value,
		HealthCheckConfigSchema,
		DEFAULT_CONFIG,
		'health check config'
	);

	return {
		alertsEnabled:
			typeof parsed.alertsEnabled === 'boolean'
				? parsed.alertsEnabled
				: DEFAULT_CONFIG.alertsEnabled,
		alertThreshold:
			parsed.alertThreshold === ALERT_THRESHOLDS.degraded ||
			parsed.alertThreshold === ALERT_THRESHOLDS.unhealthy
				? parsed.alertThreshold
				: DEFAULT_CONFIG.alertThreshold,
		diskSpaceDegradedThreshold:
			typeof parsed.diskSpaceDegradedThreshold === 'number'
				? parsed.diskSpaceDegradedThreshold
				: DEFAULT_CONFIG.diskSpaceDegradedThreshold,
		diskSpaceUnhealthyThreshold:
			typeof parsed.diskSpaceUnhealthyThreshold === 'number'
				? parsed.diskSpaceUnhealthyThreshold
				: DEFAULT_CONFIG.diskSpaceUnhealthyThreshold,
		enabled: parsed.enabled ?? DEFAULT_CONFIG.enabled,
		logRetentionDays:
			typeof parsed.logRetentionDays === 'number'
				? Math.max(1, parsed.logRetentionDays)
				: DEFAULT_CONFIG.logRetentionDays,
		memoryHeapDegradedThreshold:
			typeof parsed.memoryHeapDegradedThreshold === 'number'
				? parsed.memoryHeapDegradedThreshold
				: DEFAULT_CONFIG.memoryHeapDegradedThreshold,
		memoryHeapUnhealthyThreshold:
			typeof parsed.memoryHeapUnhealthyThreshold === 'number'
				? parsed.memoryHeapUnhealthyThreshold
				: DEFAULT_CONFIG.memoryHeapUnhealthyThreshold,
	};
}

function getThresholds(): Thresholds {
	const config = getHealthConfig();
	return {
		diskSpaceDegradedThreshold: config.diskSpaceDegradedThreshold,
		diskSpaceUnhealthyThreshold: config.diskSpaceUnhealthyThreshold,
		memoryHeapDegradedThreshold: config.memoryHeapDegradedThreshold,
		memoryHeapUnhealthyThreshold: config.memoryHeapUnhealthyThreshold,
	};
}

function getHealthConfig(): HealthCheckConfig {
	ensureHealthConfigSeeded();
	const setting = getByKeyRaw(HEALTH_CONFIG_KEY);
	return parseConfig(setting?.value ?? null);
}

/**
 * Validate that degraded thresholds are less severe than unhealthy thresholds.
 *
 * @param config - Config to validate
 * @returns Error message if validation fails, null otherwise
 */
function validateThresholdCrossing(config: HealthCheckConfig): null | string {
	if (config.memoryHeapDegradedThreshold >= config.memoryHeapUnhealthyThreshold) {
		return `Memory heap degraded threshold (${config.memoryHeapDegradedThreshold}) must be less than unhealthy threshold (${config.memoryHeapUnhealthyThreshold})`;
	}
	if (config.diskSpaceDegradedThreshold <= config.diskSpaceUnhealthyThreshold) {
		return `Disk space degraded threshold (${config.diskSpaceDegradedThreshold}) must be greater than unhealthy threshold (${config.diskSpaceUnhealthyThreshold}) (free space thresholds are inverted)`;
	}
	return null;
}

/**
 * Update health check configuration.
 * Validates threshold cross-constraints before saving.
 * Invalidates health cache after update.
 *
 * @param updates - Partial config updates
 * @param updatedBy - User ID who made the change
 * @returns Updated config, or throws on validation error
 */
function updateHealthConfig(
	updates: Partial<HealthCheckConfig>,
	updatedBy: number
): HealthCheckConfig {
	const current = getHealthConfig();
	const newConfig = {
		...current,
		...updates,
		enabled: updates.enabled ? { ...current.enabled, ...updates.enabled } : current.enabled,
	};

	const validationError = validateThresholdCrossing(newConfig);
	if (validationError) {
		throw new Error(validationError);
	}

	const value = JSON.stringify(newConfig);
	update({
		description: 'Health check configuration thresholds and settings',
		key: HEALTH_CONFIG_KEY,
		updatedBy,
		value,
	});

	// Invalidate health cache so next check uses new thresholds
	for (const listener of onConfigChangedListeners) {
		listener();
	}

	return newConfig;
}

export { getHealthConfig, getThresholds, onHealthConfigChange, updateHealthConfig };
export type { HealthCheckConfig };
