/**
 * OpenAPI descriptions and response examples for the bug intake routes.
 *
 * Kept beside `bugs.ts` rather than in it so the route file reads as the four things the intake
 * does. The examples are the same shape the handlers return, so a reader of the published schema
 * sees the supersede link in both directions without having to read the service.
 */
import {
	badRequestExample,
	FORBIDDEN_EXAMPLE,
	notFoundExample,
	UNAUTHORIZED_EXAMPLE,
} from '../constants/responseExamples.ts';

const submitBugDocs = {
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
									supersededById: null,
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
};

const listBugsDocs = {
	description:
		'Get bug reports with pagination, newest first. Optionally filtered by ' +
		'triage status, by kind (bug or feature), and by free-text search over the ' +
		'description. Every filter is applied in SQL, so the returned total counts ' +
		'the filtered set rather than the whole inbox. A report another report has ' +
		'replaced is left out unless includeSuperseded is set, because it is no longer ' +
		'separate open work; each returned report carries supersedesIds, the earlier ' +
		'reports it was filed as a correction of. Requires ADMIN or SYSOP role.',
	responses: {
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
	},
	summary: 'List bug reports (ADMIN+)',
};

const getBugDocs = {
	description:
		'Read one bug report by id, including supersedesIds and supersededById. This answers for ' +
		'a superseded report as readily as for any other, which is what lets a triager follow the ' +
		'link on a report to the one it replaced even though the default listing leaves that one ' +
		'out. Open to the account that filed the report and to ADMIN or SYSOP, matching who may ' +
		'set the supersede link; the listing endpoint stays ADMIN-only.',
	responses: {
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Bug report'),
	},
	summary: 'Read one bug report (reporter or ADMIN+)',
};

const updateBugStatusDocs = {
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
};

const supersedeBugDocs = {
	description:
		'Record that a later report replaces this one, or clear the link by sending a null ' +
		'reportId. A submitted report cannot be edited, so a correction is filed as a new ' +
		'report; this connects the two so a triager reading either one can reach the other ' +
		'and can tell which is current. Nothing is deleted or rewritten, and the original ' +
		'text stays readable: the superseded report simply stops appearing as separate open ' +
		'work in the default listing. The reporter can do this for their own report, since ' +
		'correcting your own mistake is the ordinary case; an ADMIN can do it for any report. ' +
		'A report cannot supersede itself, and a link that would close a loop through reports ' +
		'already connected is refused.',
	responses: {
		'400': badRequestExample('A report cannot supersede itself'),
		'401': UNAUTHORIZED_EXAMPLE,
		'403': FORBIDDEN_EXAMPLE,
		'404': notFoundExample('Bug report'),
	},
	summary: 'Link a bug report to the report that supersedes it',
};

export { getBugDocs, listBugsDocs, submitBugDocs, supersedeBugDocs, updateBugStatusDocs };
