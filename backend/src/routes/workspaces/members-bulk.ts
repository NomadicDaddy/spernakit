import { Elysia, t } from 'elysia';

import type { AuthPayload } from '../../plugins/auth.ts';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import { MAX_BATCH_SIZE } from '../../constants/pagination.ts';
import {
	badRequestExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { requireAuth } from '../../guards/role.ts';
import {
	canModifyWorkspaceRole,
	validateWorkspaceRole,
	type WorkspaceMemberRole,
} from '../../guards/workspaceAccess.ts';
import { authPlugin } from '../../plugins/auth.ts';
import {
	bulkAddMembers,
	bulkRemoveMembers,
	getMembershipRoles,
} from '../../services/workspaceService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { forbiddenError } from '../../utils/errorResponse.ts';
import {
	requireMembershipOrSysop,
	requireWorkspaceAdmin,
	validateBatchSize,
} from './workspace-helpers.ts';

interface RejectedResult {
	error: string;
	success: false;
	userId: number;
}

/**
 * Filter user IDs by role hierarchy — only allow removal of members with lower roles.
 *
 * @param userIds - Target user IDs to validate
 * @param requesterWsRole - The requester's workspace role
 * @param workspaceId - The workspace to check membership in
 * @returns Validated user IDs and rejected results
 */
function filterByRoleHierarchy(
	userIds: number[],
	requesterWsRole: WorkspaceMemberRole,
	workspaceId: number
): { rejectedResults: RejectedResult[]; validUserIds: number[] } {
	const validUserIds: number[] = [];
	const rejectedResults: RejectedResult[] = [];

	const roleByUser = getMembershipRoles(workspaceId, userIds);

	for (const userId of userIds) {
		const rawRole = roleByUser.get(userId);
		const targetWsRole = rawRole ? validateWorkspaceRole(rawRole) : null;
		if (targetWsRole && !canModifyWorkspaceRole(requesterWsRole, targetWsRole)) {
			rejectedResults.push({
				error: 'Cannot remove a member with equal or higher role',
				success: false,
				userId,
			});
		} else {
			validUserIds.push(userId);
		}
	}

	return { rejectedResults, validUserIds };
}

interface BulkDeleteMembersBody {
	userIds: number[];
}

interface BulkDeleteMembersContext {
	body: BulkDeleteMembersBody;
	params: { id: number };
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
}

function handleBulkDeleteMembers({ body, params, set, user }: BulkDeleteMembersContext) {
	const ctx = requireWorkspaceAdmin(user, params.id, set);
	if (!ctx.ok) return ctx.error;
	const id = params.id;

	const batchError = validateBatchSize(body.userIds.length, set);
	if (batchError) return batchError;

	// SYSOP bypasses role hierarchy; others must have higher role than targets
	const { error: membershipError, role: requesterWsRole } = requireMembershipOrSysop(
		ctx.authUser,
		id,
		set
	);
	if (membershipError) return membershipError;
	if (requesterWsRole) {
		const { rejectedResults, validUserIds } = filterByRoleHierarchy(
			body.userIds,
			requesterWsRole,
			id
		);

		if (validUserIds.length === 0 && rejectedResults.length > 0) {
			return dataResponse({
				failed: rejectedResults.length,
				results: rejectedResults,
				succeeded: 0,
				total: rejectedResults.length,
			});
		}

		const result = bulkRemoveMembers(id, validUserIds);
		return dataResponse({
			failed: result.failed + rejectedResults.length,
			results: [...result.results, ...rejectedResults],
			succeeded: result.succeeded,
			total: result.total + rejectedResults.length,
		});
	}

	const result = bulkRemoveMembers(id, body.userIds);
	return dataResponse(result);
}

const workspaceMembersBulkRoutes = new Elysia({
	detail: { tags: ['Workspaces'] },
})
	.use(authPlugin)
	.post(
		'/:id/members/bulk',
		({ body, params, set, user }) => {
			const ctx = requireWorkspaceAdmin(user, params.id, set);
			if (!ctx.ok) return ctx.error;
			const id = params.id;

			const batchError = validateBatchSize(body.members.length, set);
			if (batchError) return batchError;

			// SYSOP bypasses workspace role hierarchy; others need per-member check
			const { error: membershipError, role: wsRole } = requireMembershipOrSysop(
				ctx.authUser,
				id,
				set
			);
			if (membershipError) return membershipError;
			if (wsRole) {
				const disallowed = body.members.filter(
					(m) => !canModifyWorkspaceRole(wsRole, m.role)
				);
				if (disallowed.length > 0) {
					set.status = HTTP_STATUS.FORBIDDEN;
					return forbiddenError('Cannot assign a role equal to or higher than your own');
				}
			}

			const result = bulkAddMembers(id, body.members);
			return dataResponse(result);
		},
		{
			beforeHandle: requireAuth,
			body: t.Object({
				members: t.Array(
					t.Object({
						role: t.Union([
							t.Literal('ADMIN'),
							t.Literal('MANAGER'),
							t.Literal('OPERATOR'),
							t.Literal('VIEWER'),
						]),
						userId: t.Number({ minimum: 1 }),
					}),
					{ maxItems: 100, minItems: 1 }
				),
			}),
			detail: {
				description:
					'Bulk add multiple members to a workspace. Each member is processed ' +
					'individually. Returns partial success results indicating which members ' +
					'were added and which failed (with reasons such as user not found or ' +
					`already a member). Maximum ${MAX_BATCH_SIZE} members per request. ` +
					'Requires workspace ADMIN role or SYSOP.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									partialSuccess: dataExample('Partial success', {
										failed: 1,
										results: [
											{ success: true, userId: 4 },
											{
												error: 'User is already a member',
												success: false,
												userId: 5,
											},
										],
										succeeded: 1,
										total: 2,
									}),
								},
							},
						},
						description: 'Batch add members result with per-item status.',
					},
					'400': badRequestExample(
						`Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`
					),
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': notFoundExample('Workspace'),
				},
				summary: 'Bulk add workspace members (workspace ADMIN+)',
			},
			params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
		}
	)
	.post('/:id/members/bulk-delete', handleBulkDeleteMembers, {
		beforeHandle: requireAuth,
		body: t.Object({
			userIds: t.Array(t.Number({ minimum: 1 }), { maxItems: 100, minItems: 1 }),
		}),
		detail: {
			description:
				'Bulk remove multiple members from a workspace. Each member is processed ' +
				'individually. Returns partial success results indicating which members ' +
				'were removed and which failed (with reasons such as member not found). ' +
				`Maximum ${MAX_BATCH_SIZE} user IDs per request. ` +
				'Requires workspace ADMIN role or SYSOP.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								partialSuccess: dataExample('Partial success', {
									failed: 1,
									results: [
										{ success: true, userId: 4 },
										{
											error: 'Member not found',
											success: false,
											userId: 99,
										},
									],
									succeeded: 1,
									total: 2,
								}),
							},
						},
					},
					description: 'Batch remove members result with per-item status.',
				},
				'400': badRequestExample(`Batch size exceeds maximum of ${MAX_BATCH_SIZE} items`),
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
				'404': notFoundExample('Workspace'),
			},
			summary: 'Bulk remove workspace members (workspace ADMIN+)',
		},
		params: t.Object({ id: t.Numeric({ minimum: 1 }) }),
	});

export { workspaceMembersBulkRoutes };
