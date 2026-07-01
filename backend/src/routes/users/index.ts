import { Elysia } from 'elysia';

import { usersApiKeysRoutes } from './api-keys.ts';
import { usersBulkRoutes } from './bulk.ts';
import { usersCrudRoutes } from './crud.ts';
import { usersImpersonateRoutes } from './impersonate.ts';
import { usersProfileRoutes } from './profile.ts';

const usersRoutes = new Elysia({ name: 'users-routes' })
	.use(usersApiKeysRoutes)
	.use(usersBulkRoutes)
	.use(usersCrudRoutes)
	.use(usersImpersonateRoutes)
	.use(usersProfileRoutes);

export { usersRoutes };
