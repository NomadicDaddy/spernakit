import { Elysia, t } from 'elysia';
import { WS_CRUD_EVENTS } from 'spernakit-shared';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	conflictExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, requireAuth } from '../../guards/role.ts';
import { requireWorkspaceAccess } from '../../guards/workspaceAccess.ts';
import { authPlugin, type AuthPayload } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
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
	checkRoleAssignment,
	checkTargetModifiable,
	requireWorkspaceAdmin,
} from './workspace-helpers.ts';

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
	const ctx = requireWorkspaceAdmin(user, params.id, set);
	if (!ctx.ok) return ctx.error;
	const id = params.id;
	const userId = params.userId;

	const roleErr = checkRoleAssignment(ctx.authUser, id, body.role, set);
	if (roleErr) return roleErr;
	const targetErr = checkTargetModifiable(ctx.authUser, id, userId, set);
	if (targetErr) return targetErr;

	const updated = updateMemberRole(id, userId, body.role, ctx.authUser.id);
	if (!updated) {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Member');
	}

	logAudit({
		action: 'WORKSPACE_MEMBER_UPDATE',
		details: { memberUserId: userId, role: body.role },
		entityId: String(userId),
		entityType: 'workspace-member',
		userId: ctx.authUser.id,
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
	.get(
		'/:id/members',
		({ params, set, user }) => {
			const authUser = assertUser(user);
			const id = params.id;

			const guard = requireWorkspaceAccess({ set, user: authUser, workspaceId: id });
			if (guard) return guard;

			return dataResponse(getMembers(id));
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns all members of a workspace with their roles. The requesting user ' +
					'must be a member of workspace (or SYSOP). Each entry includes userId, ' +
					'username, email, and workspace role.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Workspace members', [
										{
											email: 'admin@example.com',
											role: 'ADMIN',
											userId: 1,
											username: 'admin',
										},
										{
											email: 'dev1@example.com',
											role: 'OPERATOR',
											userId: 4,
											username: 'dev1',
										},
									]),
								},
							},
						},
						description: 'Workspace member list.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get workspace members',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.post(
		'/:id/members',
		({ body, params, set, user }) => {
			const ctx = requireWorkspaceAdmin(user, params.id, set);
			if (!ctx.ok) return ctx.error;
			const id = params.id;

			const roleErr = checkRoleAssignment(ctx.authUser, id, body.role, set);
			if (roleErr) return roleErr;

			const added = addMember(id, body.userId, body.role, ctx.authUser.id);
			if (!added) {
				set.status = HTTP_STATUS.CONFLICT;
				return conflictError('User is already a member');
			}

			logAudit({
				action: 'WORKSPACE_MEMBER_ADD',
				details: { memberUserId: body.userId, role: body.role },
				entityId: String(body.userId),
				entityType: 'workspace-member',
				userId: ctx.authUser.id,
				workspaceId: id,
			});
			broadcastCrudToWorkspace(id, WS_CRUD_EVENTS.WORKSPACE_MEMBER_CREATED, {
				userId: body.userId,
			});
			set.status = HTTP_STATUS.CREATED;
			return successResponse();
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				role: t.Union([
					t.Literal('ADMIN'),
					t.Literal('MANAGER'),
					t.Literal('OPERATOR'),
					t.Literal('VIEWER'),
				]),
				userId: t.Number({ minimum: 1 }),
			}),
			detail: {
				description:
					'Adds a user to workspace with specified role (ADMIN, MANAGER, ' +
					'OPERATOR, or VIEWER). Returns 409 if user is already a member. ' +
					'Returns 201 on success. Requires workspace ADMIN role or SYSOP.',
				responses: {
					'201': {
						content: {
							'application/json': {
								examples: { success: SUCCESS_EXAMPLE },
							},
						},
						description: 'Member added to workspace.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'409': conflictExample('User is already a member'),
				},
				summary: 'Add a member to workspace (workspace ADMIN+)',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.delete(
		'/:id/members/:userId',
		({ params, set, user }) => {
			const ctx = requireWorkspaceAdmin(user, params.id, set);
			if (!ctx.ok) return ctx.error;
			const id = params.id;
			const userId = params.userId;

			const targetErr = checkTargetModifiable(ctx.authUser, id, userId, set);
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
				userId: ctx.authUser.id,
				workspaceId: id,
			});
			broadcastCrudToWorkspace(id, WS_CRUD_EVENTS.WORKSPACE_MEMBER_DELETED, { userId });
			return successResponse();
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Removes a user from workspace by userId. Returns 404 if member is ' +
					'not found. Requires workspace ADMIN role or SYSOP.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: { success: SUCCESS_EXAMPLE },
							},
						},
						description: 'Member removed from workspace.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': notFoundExample('Member'),
				},
				summary: 'Remove a member from workspace (workspace ADMIN+)',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }), userId: t.Numeric({ minimum: 1 }) }),
		}
	)
	.put('/:id/members/:userId/role', handleUpdateMemberRole, {
		beforeHandle: requireAuth,
		body: t.Object({
			role: t.Union([
				t.Literal('ADMIN'),
				t.Literal('MANAGER'),
				t.Literal('OPERATOR'),
				t.Literal('VIEWER'),
			]),
		}),
		detail: {
			description:
				"Changes a workspace member's role. Valid roles: ADMIN, MANAGER, " +
				'OPERATOR, VIEWER. Returns 404 if member is not found in workspace. ' +
				'Requires workspace ADMIN role or SYSOP.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'Member role updated.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
				'404': notFoundExample('Member'),
			},
			summary: 'Update member role (workspace ADMIN+)',
		},
		params: t.Object({ id: t.Numeric({ minimum: 1 }), userId: t.Numeric({ minimum: 1 }) }),
	});

export { workspaceMembersCrudRoutes };
