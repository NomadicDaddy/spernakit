import { Elysia } from 'elysia';

import { systemBackupRoutes } from './backup.ts';
import { systemDashboardRoutes } from './dashboard.ts';
import { systemMetricsRoutes } from './metrics.ts';

const systemRoutes = new Elysia({ name: 'system-routes' })
	.use(systemBackupRoutes)
	.use(systemDashboardRoutes)
	.use(systemMetricsRoutes);

export { systemRoutes };
