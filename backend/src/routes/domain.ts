import { Elysia } from 'elysia';

import { auditRoutes } from './audit.ts';
import { authRoutes } from './auth/index.ts';
import { bugsRoutes } from './bugs.ts';
import { businessMetricsRoutes } from './business-metrics.ts';
import { dashboardRoutes } from './dashboards/index.ts';
import { databaseAdminRoutes } from './database-admin/index.ts';
import { fileRoutes } from './files/index.ts';
import { healthRoutes } from './health/index.ts';
import { notificationRoutes } from './notifications/index.ts';
import { onboardingRoutes } from './onboarding.ts';
import { settingsRoutes } from './settings/index.ts';
import { systemRoutes } from './system/index.ts';
import { taskRoutes } from './tasks.ts';
import { usersRoutes } from './users/index.ts';
import { workspaceRoutes } from './workspaces/index.ts';

/**
 * Every route group the API serves, mounted together under /api/v1 by create-api-app.ts with a
 * single .use(). The type is inferred, never widened, so each group's routes stay in
 * `ReturnType<typeof createApiApp>` for the typed gate scripts.
 *
 * An application adds its own route groups through its own aggregator, built the same way in a
 * file of its own, and mounts it here with one more .use() at the end of the chain. It does not
 * add groups to create-api-app.ts. A nested aggregator keeps each chain short, which keeps the
 * composed type inside TypeScript's instantiation-depth limit (TS2589) as the group count grows.
 */
const domainRoutes = new Elysia({ name: 'routes' })
	.use(auditRoutes)
	.use(authRoutes)
	.use(bugsRoutes)
	.use(businessMetricsRoutes)
	.use(databaseAdminRoutes)
	.use(dashboardRoutes)
	.use(fileRoutes)
	.use(healthRoutes)
	.use(notificationRoutes)
	.use(onboardingRoutes)
	.use(settingsRoutes)
	.use(systemRoutes)
	.use(taskRoutes)
	.use(usersRoutes)
	.use(workspaceRoutes);

type DomainRoutes = typeof domainRoutes;

export { domainRoutes };
export type { DomainRoutes };
