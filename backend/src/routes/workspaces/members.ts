import { Elysia } from 'elysia';

import { workspaceMembersBulkRoutes } from './members-bulk.ts';
import { workspaceMembersCrudRoutes } from './members-crud.ts';

const workspaceMembersRoutes = new Elysia({
	detail: { tags: ['Workspaces'] },
	prefix: '/workspaces',
})
	.use(workspaceMembersCrudRoutes)
	.use(workspaceMembersBulkRoutes);

export { workspaceMembersRoutes };
