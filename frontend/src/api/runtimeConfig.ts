import type { DataResponse } from './types';

import { apiClient } from './client';

/** Recursive value type for the read-only runtime configuration snapshot. */
export type SnapshotValue =
	{ [key: string]: SnapshotValue } | boolean | number | SnapshotValue[] | string;

/** A single named section of the snapshot (e.g. `server`, `database`). */
export type ConfigSection = Record<string, SnapshotValue>;

/** The full redacted snapshot: a map of section name to its read-only fields. */
export type RuntimeConfigSnapshot = Record<string, ConfigSection>;

/**
 * Fetch the redacted, read-only runtime configuration snapshot (SYSOP only).
 * All secrets are masked server-side; this never sends a config-writing request.
 */
function getRuntimeConfig(): Promise<DataResponse<RuntimeConfigSnapshot>> {
	return apiClient.get<DataResponse<RuntimeConfigSnapshot>>('/settings/runtime-config');
}

export { getRuntimeConfig };
