/**
 * Storage key versioning for localStorage/sessionStorage.
 *
 * All persisted data should use versioned storage keys to enable safe schema migration.
 * When storage schema changes, bump the version to avoid conflicts with old data.
 *
 * Format: {prefix}-{key}:v{version}
 * Example: myapp-auth:v1
 */

/** Current storage schema version */
const STORAGE_VERSION = 1;

/** Storage key prefix — injected from defaults.json via Vite define */
const STORAGE_PREFIX = __APP_SLUG__;

/** Storage keys for persisted state */
const STORAGE_KEYS = {
	auth: `${STORAGE_PREFIX}-auth:v${STORAGE_VERSION}`,
	layout: `${STORAGE_PREFIX}-layout:v${STORAGE_VERSION}`,
	sidebar: `${STORAGE_PREFIX}-sidebar:v${STORAGE_VERSION}`,
	theme: `${STORAGE_PREFIX}-theme:v${STORAGE_VERSION}`,
	workspace: `${STORAGE_PREFIX}-workspace:v${STORAGE_VERSION}`,
} as const;

export { STORAGE_KEYS };
