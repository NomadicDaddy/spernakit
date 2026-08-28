import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { MAX_PROPERTIES_DEFAULT } from '../constants/validation.ts';
import { assertUser } from '../guards/role.ts';
import { authPlugin } from '../plugins/auth.ts';
import { limitParam, pageParam } from '../schemas/pagination.ts';
import { actorFields, log as logAudit } from '../services/auditService.ts';
import {
	getById,
	getWithLinks,
	list,
	submit,
	supersede,
	updateStatus,
	withLinks,
} from '../services/bugReportService.ts';
import { dataResponse, paginatedResponse } from '../utils/apiResponse.ts';
import { forbiddenError, notFoundError } from '../utils/errorResponse.ts';
import {
	getBugDocs,
	listBugsDocs,
	submitBugDocs,
	supersedeBugDocs,
	updateBugStatusDocs,
} from './bugs.docs.ts';
import {
	MAX_DESCRIPTION_LENGTH,
	MAX_EMAIL_LENGTH,
	mayActOn,
	statusSchema,
	supersedeRefusal,
	trimSubmittedText,
} from './bugs.helpers.ts';

const bugsRoutes = new Elysia({ detail: { tags: ['Bugs'] }, prefix: '/bugs' })
	.use(authPlugin)
	.post(
		'',
		({ body, user }) => {
			const authedUser = assertUser(user);

			const saved = submit({
				description: body.description,
				email: body.email,
				kind: body.kind,
				metadata: body.metadata,
				userId: authedUser.id,
			});

			return dataResponse(saved);
		},
		{
			body: t.Object({
				description: t.String({ maxLength: MAX_DESCRIPTION_LENGTH, minLength: 1 }),
				email: t.Optional(t.String({ format: 'email', maxLength: MAX_EMAIL_LENGTH })),
				kind: t.Optional(t.Union([t.Literal('bug'), t.Literal('feature')])),
				metadata: t.Optional(
					t.Record(
						t.String(),
						t.Union([
							t.String(),
							t.Number(),
							t.Boolean(),
							t.Null(),
							t.Array(t.Union([t.String(), t.Number(), t.Boolean(), t.Null()])),
						]),
						{ maxProperties: MAX_PROPERTIES_DEFAULT },
					),
				),
			}),
			detail: submitBugDocs,
			requireAuth: true,
			transform({ body }) {
				trimSubmittedText(body);
			},
		},
	)
	// The path is `''`, matching the POST above, and not `'/'`. Registering the two forms on the
	// same collection puts a `/api/v1/bugs` node and a `/api/v1/bugs/` node in the router, and a
	// GET of either URL then resolves to the node the POST created and finds no GET on it. The
	// listing answered 404 both ways until these agreed.
	.get(
		'',
		({ query }) => {
			const page = query.page ?? 1;
			const limit = query.limit ?? 50;
			return paginatedResponse(
				list(page, limit, {
					includeSuperseded: query.includeSuperseded ?? false,
					...(query.kind ? { kind: query.kind } : {}),
					...(query.search ? { search: query.search } : {}),
					...(query.status ? { status: query.status } : {}),
				}),
			);
		},
		{
			detail: listBugsDocs,
			query: t.Object({
				includeSuperseded: t.Optional(t.BooleanString()),
				kind: t.Optional(t.Union([t.Literal('bug'), t.Literal('feature')])),
				limit: limitParam({ default: 50 }),
				page: pageParam(),
				search: t.Optional(t.String({ maxLength: 200 })),
				status: t.Optional(statusSchema),
			}),
			requireRole: 'ADMIN',
		},
	)
	.get(
		'/:id',
		({ params, set, user }) => {
			const authedUser = assertUser(user);

			const report = getWithLinks(params.id);
			if (!report) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Bug report');
			}
			if (!mayActOn(report.userId, authedUser)) {
				set.status = HTTP_STATUS.FORBIDDEN;
				return forbiddenError('Only the reporter or an administrator can read a report');
			}
			return dataResponse(report);
		},
		{
			detail: getBugDocs,
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
			// Not ADMIN-only, because the reporter may set the supersede link on their own report
			// and would otherwise be unable to read back what they just wrote. The listing above
			// stays ADMIN-only: reading one report you filed is not the same as reading the queue.
			requireAuth: true,
		},
	)
	.patch(
		'/:id',
		({ body, params, set, user }) => {
			const authedUser = assertUser(user);

			const result = updateStatus(params.id, body.status);
			if (!result) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Bug report');
			}

			logAudit({
				action: 'bug.status.updated',
				details: {
					previousStatus: result.previousStatus,
					status: body.status,
				},
				entityId: String(params.id),
				entityType: 'bug-report',
				...actorFields(authedUser),
			});

			return dataResponse(result.report);
		},
		{
			body: t.Object({
				status: statusSchema,
			}),
			detail: updateBugStatusDocs,
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
			requireRole: 'ADMIN',
		},
	)
	.put(
		'/:id/superseded-by',
		({ body, params, set, user }) => {
			const authedUser = assertUser(user);

			// Read before the write, because the answer to "may I" is about the report that is
			// actually there. An id nobody filed is 404 whoever asks, which is the same answer the
			// service would give, and asking here keeps the ownership check off a row it invented.
			const existing = getById(params.id);
			if (!existing) {
				set.status = HTTP_STATUS.NOT_FOUND;
				return notFoundError('Bug report');
			}
			if (!mayActOn(existing.userId, authedUser)) {
				set.status = HTTP_STATUS.FORBIDDEN;
				return forbiddenError(
					'Only the reporter or an administrator can supersede a report',
				);
			}

			const result = supersede(params.id, body.reportId);
			if (result.kind !== 'ok') return supersedeRefusal(result, set);

			logAudit({
				action: 'bug.superseded',
				details: {
					previousSupersededById: existing.supersededById,
					supersededById: body.reportId,
				},
				entityId: String(params.id),
				entityType: 'bug-report',
				...actorFields(authedUser),
			});

			return dataResponse(withLinks(result.report));
		},
		{
			body: t.Object({
				reportId: t.Union([t.Numeric({ minimum: 1 }), t.Null()]),
			}),
			detail: supersedeBugDocs,
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
			requireAuth: true,
		},
	);

export { bugsRoutes };
