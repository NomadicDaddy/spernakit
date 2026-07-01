import { z } from 'zod';

/**
 * Database admin panel kill-switch. Disabled by default — the panel grants
 * SYSOP raw table read/write access, so deployments must opt in explicitly by
 * setting `databaseAdmin.enabled: true` in `config/<slug>.json` (recommended
 * for development environments only).
 */
export const databaseAdminSchema = z.object({
	enabled: z.boolean().default(false),
});
