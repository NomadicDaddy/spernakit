import { Elysia } from 'elysia';

import { dashboardCrudRoutes } from './crud.ts';
import { dashboardShareExportRoutes } from './share-export.ts';
import { dashboardTemplatesRoutes } from './templates-import.ts';

// dashboardTemplatesRoutes must be registered BEFORE dashboardCrudRoutes so that
// the literal `/dashboards/shared/:token` and `/dashboards/templates` routes match
// before Elysia falls through to dashboardCrudRoutes' `/dashboards/:id` numeric matcher.
const dashboardRoutes = new Elysia({ name: 'dashboards-routes' })
	.use(dashboardTemplatesRoutes)
	.use(dashboardCrudRoutes)
	.use(dashboardShareExportRoutes);

export { dashboardRoutes };
