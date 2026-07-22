import { Type } from '../configSchemaHelpers';

/**
 * Database admin panel kill-switch. Disabled by default — the panel grants
 * SYSOP raw table read/write access, so deployments must opt in explicitly by
 * setting `databaseAdmin.enabled: true` in `config/<slug>.json` (recommended
 * for development environments only).
 */
export const databaseAdminSchema = Type.Object({
	enabled: Type.Boolean({ default: false }),
});
