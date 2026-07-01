import { Elysia } from 'elysia';

import { parseWorkspaceId } from '../utils/validation.ts';

/**
 * Elysia plugin that extracts workspaceId from the X-Workspace-ID header.
 * Derives a numeric workspaceId (or null) available to all downstream handlers.
 */
const workspacePlugin = new Elysia({ name: 'workspace' }).derive(
	{ as: 'scoped' },
	({ request }) => {
		const headerValue = request.headers.get('x-workspace-id');
		return { workspaceId: parseWorkspaceId(headerValue ?? undefined) };
	}
);

export { workspacePlugin };
