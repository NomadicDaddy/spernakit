import { Elysia, t } from 'elysia';
import { WS_CRUD_EVENTS } from 'spernakit-shared';

import type { AuthPayload } from '../../plugins/auth.ts';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { DEFAULT_PAGE, DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../constants/pagination.ts';
import { assertUser, isSysop, requireAuth, requireRoleFresh } from '../../guards/role.ts';
import { requireWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { trackEvent } from '../../services/metricsService.ts';
import {
	broadcastCrudToAdmins,
	broadcastCrudToWorkspace,
} from '../../services/websocketService.ts';
import { create, getById, list, softDelete, update } from '../../services/workspaceService.ts';
import { dataResponse, paginatedResponse, successResponse } from '../../utils/apiResponse.ts';
import {
	conflictError,
	isUniqueConstraintError,
	notFoundError,
} from '../../utils/errorResponse.ts';
import {
	createWorkspaceDocs,
	deleteWorkspaceDocs,
	getWorkspaceByIdDocs,
	listWorkspacesDocs,
	updateWorkspaceDocs,
} from './crud.docs.ts';
import {
	findWorkspaceOrThrow,
	requireWorkspaceAdmin,
	type SetWithStatus,
} from './workspace-helpers.ts';

interface CreateWorkspaceBody {
	description?: string;
	name: string;
	slug: string;
}

interface CreateWorkspaceContext {
	body: CreateWorkspaceBody;
	set: { status?: number | string };
	user: AuthPayload | null;
}

interface WorkspaceSettingsBranding {
	accentColor?: string;
	logoFileId?: number;
}

interface WorkspaceSettingsInput {
	branding?: WorkspaceSettingsBranding;
	currency?: string;
	defaultDashboardId?: number;
	timezone?: string;
}

interface UpdateWorkspaceBody {
	description?: string;
	name?: string;
	settings?: WorkspaceSettingsInput;
}

interface UpdateWorkspaceContext {
	body: UpdateWorkspaceBody;
	params: { id: number };
	set: SetWithStatus;
	user: AuthPayload | null;
}

interface DeleteWorkspaceContext {
	params: { id: number };
	set: SetWithStatus;
	user: AuthPayload | null;
}

function handleUpdateWorkspace({ body, params, set, user }: UpdateWorkspaceContext) {
	const ctx = requireWorkspaceAdmin(user, params.id, set);
	if (!ctx.ok) return ctx.error;
	const id = params.id;

	// Fetch current workspace to compute settings diff
	const before = getById(id);
	const beforeSettings = before?.settings ?? null;

	const result = update(id, {
		description: body.description,
		name: body.name,
		settings: body.settings,
		updatedBy: ctx.authUser.id,
	});
	if (!result) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Workspace');
	}

	// Compute diff for audit log (only include changed keys)
	const auditDetails: Record<string, unknown> = {};
	if (body.name !== undefined) auditDetails.name = body.name;
	if (body.description !== undefined) auditDetails.description = body.description;
	if (body.settings !== undefined) {
		const diff: Record<string, { after: unknown; before: unknown }> = {};
		const allKeys = new Set([
			...Object.keys(beforeSettings ?? {}),
			...Object.keys(body.settings),
		]);
		for (const key of allKeys) {
			const beforeVal = (beforeSettings as Record<string, unknown>)?.[key];
			const afterVal = (body.settings as Record<string, unknown>)[key];
			if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) {
				diff[key] = { after: afterVal, before: beforeVal };
			}
		}
		if (Object.keys(diff).length > 0) {
			auditDetails.settingsDiff = diff;
		}
	}

	logAudit({
		action: 'WORKSPACE_UPDATE',
		details: auditDetails,
		entityId: String(id),
		entityType: 'workspace',
		userId: ctx.authUser.id,
		workspaceId: id,
	});
	broadcastCrudToWorkspace(id, WS_CRUD_EVENTS.WORKSPACE_UPDATED, { id });
	return dataResponse(result);
}

function handleDeleteWorkspace({ params, set, user }: DeleteWorkspaceContext) {
	const ctx = requireWorkspaceAdmin(user, params.id, set);
	if (!ctx.ok) return ctx.error;
	const id = params.id;

	const deleted = softDelete(id, ctx.authUser.id);
	if (!deleted) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Workspace');
	}

	logAudit({
		action: 'WORKSPACE_DELETE',
		entityId: String(id),
		entityType: 'workspace',
		userId: ctx.authUser.id,
		workspaceId: id,
	});
	broadcastCrudToWorkspace(id, WS_CRUD_EVENTS.WORKSPACE_DELETED, { id });
	return successResponse();
}

function handleCreateWorkspace({ body, set, user }: CreateWorkspaceContext) {
	const authUser = assertUser(user);
	try {
		const workspace = create({
			description: body.description,
			name: body.name,
			ownerId: authUser.id,
			slug: body.slug,
		});

		trackEvent({
			eventCategory: 'conversion',
			eventName: 'workspace_created',
			metadata: { workspaceName: body.name },
			userId: authUser.id,
			workspaceId: workspace.id,
		});

		logAudit({
			action: 'WORKSPACE_CREATE',
			details: { name: body.name, slug: body.slug },
			entityId: String(workspace.id),
			entityType: 'workspace',
			userId: authUser.id,
			workspaceId: workspace.id,
		});
		broadcastCrudToAdmins(WS_CRUD_EVENTS.WORKSPACE_CREATED, { id: workspace.id });
		set.status = HTTP_STATUS.CREATED;
		return dataResponse(workspace);
	} catch (err) {
		if (isUniqueConstraintError(err)) {
			set.status = HTTP_STATUS.CONFLICT;
			return conflictError(err.message);
		}
		throw err;
	}
}

const workspaceCrudRoutes = new Elysia({
	detail: { tags: ['Workspaces'] },
	prefix: '/workspaces',
})
	.use(authPlugin)
	.get(
		'/',
		({ query, user }) => {
			const authUser = assertUser(user);
			const userIsSysop = isSysop(authUser);
			const result = list({
				isSysop: userIsSysop,
				limit: query.limit ?? DEFAULT_PAGE_LIMIT,
				page: query.page ?? DEFAULT_PAGE,
				userId: authUser.id,
			});
			return paginatedResponse(result);
		},
		{
			beforeHandle: requireAuth,
			detail: listWorkspacesDocs,
			query: t.Object({
				limit: t.Optional(t.Number({ maximum: MAX_PAGE_LIMIT, minimum: 1 })),
				page: t.Optional(t.Number({ minimum: 1 })),
			}),
		}
	)
	// API-only: No frontend caller (list endpoint covers UI needs). Available for API-key consumers.
	.get(
		'/:id',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			const id = params.id;

			const guard = requireWorkspaceAccess({
				set,
				user: authUser,
				workspaceId: id,
			});
			if (guard) return guard;

			const result = findWorkspaceOrThrow(id, set);
			if (result.error) return result.error;

			return dataResponse(result.workspace);
		},
		{
			beforeHandle: requireAuth,
			detail: getWorkspaceByIdDocs,
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.post('/', handleCreateWorkspace, {
		beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
		body: t.Object({
			description: t.Optional(t.String({ maxLength: 1000 })),
			name: t.String({ maxLength: 255, minLength: 1 }),
			slug: t.String({ maxLength: 100, minLength: 1, pattern: '^[a-zA-Z0-9_-]+$' }),
		}),
		detail: createWorkspaceDocs,
	})
	.put('/:id', handleUpdateWorkspace, {
		beforeHandle: requireAuth,
		body: t.Object({
			description: t.Optional(t.String({ maxLength: 1000 })),
			name: t.Optional(t.String({ maxLength: 255, minLength: 1 })),
			settings: t.Optional(
				t.Object({
					branding: t.Optional(
						t.Object({
							accentColor: t.Optional(t.String({ maxLength: 7 })),
							logoFileId: t.Optional(t.Integer()),
						})
					),
					currency: t.Optional(t.String({ maxLength: 10 })),
					defaultDashboardId: t.Optional(t.Integer()),
					timezone: t.Optional(t.String({ maxLength: 100 })),
				})
			),
		}),
		detail: updateWorkspaceDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	})
	.delete('/:id', handleDeleteWorkspace, {
		beforeHandle: requireAuth,
		detail: deleteWorkspaceDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	});

export { workspaceCrudRoutes };
