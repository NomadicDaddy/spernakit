import { Elysia } from 'elysia';

import { notificationCrudRoutes } from './crud.ts';
import { notificationBroadcastRoutes } from './notification-broadcast.ts';
import { notificationPreferencesRoutes } from './preferences-broadcast.ts';

const notificationRoutes = new Elysia({ name: 'notifications-routes' })
	.use(notificationBroadcastRoutes)
	.use(notificationCrudRoutes)
	.use(notificationPreferencesRoutes);

export { notificationRoutes };
