import { Elysia } from 'elysia';

import { healthAlertsConfigRoutes } from './alerts-config.ts';
import { healthChecksRoutes } from './checks.ts';

const healthRoutes = new Elysia({ name: 'health-routes' })
	.use(healthChecksRoutes)
	.use(healthAlertsConfigRoutes);

export { healthRoutes };
