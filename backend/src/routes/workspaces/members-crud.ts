import { Elysia, t } from 'elysia';
import { WS_CRUD_EVENTS } from 'spernakit-shared';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { assertUser } from '../../guards/role.ts';
import { type AuthPayload, authPlugin } from '../../plugins/auth.ts';
import { workspacePlugin } from '../../plugins/workspace.ts';
import { actorFields, log as logAudit } from '../../services/auditService.ts';
import { broadcastCrudToWorkspace } from '../../services/websocketService.ts';
import {
	addMember,
	getMembers,
	removeMember,
	updateMemberRole,
} from '../../services/workspaceService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { conflictError, notFoundError } from '../../utils/errorResponse.ts';
import {
	addWorkspaceMemberDocs,
	listWorkspaceMembersDocs,
	removeWorkspaceMemberDocs,
	updateWorkspaceMemberRoleDocs,
} from './members-crud.docs.ts';
import { checkRoleAssignment, checkTargetModifiable } from './workspace-helpers.ts';

function handleUpdateMemberRole({
	body,
	params,
	set,
	user,
}: {
	body: { role: 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER' };
	params: { id: number; userId: number };
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const id = params.id;
	const userId = params.userId;

	const roleErr = checkRoleAssignment(authUser, id, body.role, set);
	if (roleErr) return roleErr;
	const targetErr = checkTargetModifiable(authUser, id, userId, set);
	if (targetErr) return targetErr;

	const updated = updateMemberRole(id, userId, body.role, authUser.id);
	if (!updated) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Member');
	}

	logAudit({
		action: 'WORKSPACE_MEMBER_UPDATE',
		details: { memberUserId: userId, role: body.role },
		entityId: String(userId),
		entityType: 'workspace-member',
		...actorFields(authUser),
		workspaceId: id,
	});
	broadcastCrudToWorkspace(id, WS_CRUD_EVENTS.WORKSPACE_MEMBER_UPDATED, {
		role: body.role,
		userId,
	});
	return successResponse();
}

const workspaceMembersCrudRoutes = new Elysia({
	detail: { tags: ['Workspaces'] },
})
	.use(authPlugin)
	.use(workspacePlugin)
	.get(
		'/:id/members',
		({ params }) => {
			const id = params.id;
			return dataResponse(getMembers(id));
		},
		{
			detail: listWorkspaceMembersDocs,
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
			requireAuth: true,
			requireWorkspaceMemberParam: true,
		},
	)
	.post(
		'/:id/members',
		({ body, params, set, user }) => {
			const authUser = assertUser(user);
			const id = params.id;

			const roleErr = checkRoleAssignment(authUser, id, body.role, set);
			if (roleErr) return roleErr;

			const added = addMember(id, body.userId, body.role, authUser.id);
			if (!added) {
				set.status = HTTP_STATUS.CONFLICT;
				return conflictError('User is already a member');
			}

			logAudit({
				action: 'WORKSPACE_MEMBER_ADD',
				details: { memberUserId: body.userId, role: body.role },
				entityId: String(body.userId),
				entityType: 'workspace-member',
				...actorFields(authUser),
				workspaceId: id,
			});
			broadcastCrudToWorkspace(id, WS_CRUD_EVENTS.WORKSPACE_MEMBER_CREATED, {
				userId: body.userId,
			});
			set.status = HTTP_STATUS.CREATED;
			return successResponse();
		},
		{
			body: t.Object({
				role: t.Union([
					t.Literal('ADMIN'),
					t.Literal('MANAGER'),
					t.Literal('OPERATOR'),
					t.Literal('VIEWER'),
				]),
				userId: t.Number({ minimum: 1 }),
			}),
			detail: addWorkspaceMemberDocs,
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
			requireAuth: true,
			requireWorkspaceAdminParam: true,
		},
	)
	.delete(
		'/:id/members/:userId',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			const id = params.id;
			const userId = params.userId;

			const targetErr = checkTargetModifiable(authUser, id, userId, set);
			if (targetErr) return targetErr;

			const removed = removeMember(id, userId);
			if (!removed) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Member');
			}

			logAudit({
				action: 'WORKSPACE_MEMBER_REMOVE',
				details: { memberUserId: userId },
				entityId: String(userId),
				entityType: 'workspace-member',
				...actorFields(authUser),
				workspaceId: id,
			});
			broadcastCrudToWorkspace(id, WS_CRUD_EVENTS.WORKSPACE_MEMBER_DELETED, { userId });
			return successResponse();
		},
		{
			detail: removeWorkspaceMemberDocs,
			params: t.Object({ id: t.Numeric({ minimum: 1 }), userId: t.Numeric({ minimum: 1 }) }),
			requireAuth: true,
			requireWorkspaceAdminParam: true,
		},
	)
	.put('/:id/members/:userId/role', handleUpdateMemberRole, {
		body: t.Object({
			role: t.Union([
				t.Literal('ADMIN'),
				t.Literal('MANAGER'),
				t.Literal('OPERATOR'),
				t.Literal('VIEWER'),
			]),
		}),
		detail: updateWorkspaceMemberRoleDocs,
		params: t.Object({ id: t.Numeric({ minimum: 1 }), userId: t.Numeric({ minimum: 1 }) }),
		requireAuth: true,
		requireWorkspaceAdminParam: true,
	});

export { workspaceMembersCrudRoutes };
