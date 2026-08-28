import { Elysia, t } from 'elysia';
import { BUG_REPORT_STATUSES } from 'spernakit-shared';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import {
	badRequestExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';
import { MAX_PROPERTIES_DEFAULT } from '../constants/validation.ts';
import { assertUser } from '../guards/role.ts';
import { authPlugin } from '../plugins/auth.ts';
import { limitParam, pageParam } from '../schemas/pagination.ts';
import { actorFields, log as logAudit } from '../services/auditService.ts';
import { list, submit, updateStatus } from '../services/bugReportService.ts';
import { dataResponse, paginatedResponse } from '../utils/apiResponse.ts';
import { notFoundError } from '../utils/errorResponse.ts';

const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_EMAIL_LENGTH = 255;

/** Body fields the service stores trimmed, so the schema has to be shown the trimmed value. */
const TRIMMED_FIELDS = ['description', 'email'] as const;

/**
 * Status union derived from the shared tuple rather than hand-written, so adding a
 * status to `BUG_REPORT_STATUSES` reaches this route without editing it.
 */
const statusSchema = t.Union(BUG_REPORT_STATUSES.map((status) => t.Literal(status)));

/**
 * Trim the submitted strings before Elysia checks them against the schema.
 *
 * The service stores a trimmed description, so the value the schema is asked about has to be the
 * trimmed one. Checking first and trimming afterwards let a description of nothing but spaces
 * satisfy `minLength: 1`, trim away to nothing, and land in the table as a row titled
 * `(untitled)` with no body. Reports are closed by status rather than deleted and the PATCH route
 * changes only the status, so such a row can never be corrected or removed.
 *
 * A transform hook is the last stage before validation, which is what makes this the place for it
 * rather than the handler. Every string the service trims is trimmed here, so the constraint the
 * schema asserts is the constraint the stored value satisfies.
 *
 * @param body - The parsed request body, mutated in place.
 */
function trimSubmittedText(body: unknown): void {
	if (typeof body !== 'object' || body === null) return;
	const record = body as Record<string, unknown>;
	for (const field of TRIMMED_FIELDS) {
		const value = record[field];
		if (typeof value === 'string') record[field] = value.trim();
	}
}

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
			detail: {
				description:
					'Submit a bug report or feature request with automatic metadata capture. ' +
					'Requires authentication. Entries are persisted to the bug_reports table. ' +
					'The frontend captures browser info, URL, screen size, and other ' +
					'diagnostic information automatically. The optional kind field ' +
					"distinguishes 'bug' (default) from 'feature' (enhancement request).",
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: {
										summary: 'Bug report submitted successfully',
										value: {
											data: {
												createdAt: '2026-03-05T12:00:00Z',
												description: 'Application crashes on login',
												email: 'user@example.com',
												id: 42,
												kind: 'bug',
												metadata: {
													reportedBy: {
														userId: 1,
														username: 'operator',
													},
												},
												status: 'open',
												title: 'Application crashes on login',
												updatedAt: '2026-03-05T12:00:00Z',
												userId: 1,
											},
										},
									},
								},
							},
						},
						description: 'Bug report or feature request created successfully.',
					},
					'400': badRequestExample(
						'Description must not be empty after trimming, and must not exceed 5000 characters',
					),
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Submit a bug report or feature request',
			},
			requireAuth: true,
			transform({ body }) {
				trimSubmittedText(body);
			},
		},
	)
	.get(
		'/',
		({ query }) => {
			const page = query.page ?? 1;
			const limit = query.limit ?? 50;
			return paginatedResponse(
				list(page, limit, {
					...(query.kind ? { kind: query.kind } : {}),
					...(query.search ? { search: query.search } : {}),
					...(query.status ? { status: query.status } : {}),
				}),
			);
		},
		{
			detail: {
				description:
					'Get bug reports with pagination, newest first. Optionally filtered by ' +
					'triage status, by kind (bug or feature), and by free-text search over the ' +
					'description. Every filter is applied in SQL, so the returned total counts ' +
					'the filtered set rather than the whole inbox. Requires ADMIN or SYSOP role.',
				responses: {
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'List bug reports (ADMIN+)',
			},
			query: t.Object({
				kind: t.Optional(t.Union([t.Literal('bug'), t.Literal('feature')])),
				limit: limitParam({ default: 50 }),
				page: pageParam(),
				search: t.Optional(t.String({ maxLength: 200 })),
				status: t.Optional(statusSchema),
			}),
			requireRole: 'ADMIN',
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
			detail: {
				description:
					'Move a bug report or feature request to a new triage status. Reports are ' +
					'retained indefinitely and closed via status rather than deleted, so this is ' +
					'the only way a report leaves the open state. Requires ADMIN or SYSOP role.',
				responses: {
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
					'404': notFoundExample('Bug report'),
				},
				summary: 'Update bug report status (ADMIN+)',
			},
			params: t.Object({
				id: t.Numeric({ minimum: 1 }),
			}),
			requireRole: 'ADMIN',
		},
	);

export { bugsRoutes };
