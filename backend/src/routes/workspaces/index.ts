import { Elysia } from 'elysia';

import { workspaceCrudRoutes } from './crud.ts';
import { workspaceMembersRoutes } from './members.ts';

const workspaceRoutes = new Elysia({ name: 'workspaces-routes' })
	.use(workspaceCrudRoutes)
	.use(workspaceMembersRoutes);

export { workspaceRoutes };
