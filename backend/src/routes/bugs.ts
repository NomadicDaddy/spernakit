import { Elysia, t } from 'elysia';

import {
	badRequestExample,
	FORBIDDEN_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';
import { MAX_PROPERTIES_DEFAULT } from '../constants/validation.ts';
import { assertUser, requireAuth, requireRoleFresh } from '../guards/role.ts';
import { authPlugin } from '../plugins/auth.ts';
import { list, submit } from '../services/bugReportService.ts';
import { dataResponse, paginatedResponse } from '../utils/apiResponse.ts';

const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_EMAIL_LENGTH = 255;

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
			beforeHandle: requireAuth,
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
						{ maxProperties: MAX_PROPERTIES_DEFAULT }
					)
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
						'Description is required and must not exceed 5000 characters'
					),
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Submit a bug report or feature request',
			},
		}
	)
	.get(
		'/',
		({ query }) => {
			const page = query.page ?? 1;
			const limit = query.limit ?? 50;
			return paginatedResponse(list(page, limit));
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description: 'Get bug reports with pagination. Requires ADMIN or SYSOP role.',
				responses: {
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'List bug reports (ADMIN+)',
			},
			query: t.Object({
				limit: t.Optional(t.Numeric({ default: 50, maximum: 200, minimum: 1 })),
				page: t.Optional(t.Numeric({ default: 1, minimum: 1 })),
			}),
		}
	);

export { bugsRoutes };
