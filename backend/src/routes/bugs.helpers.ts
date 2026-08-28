/**
 * The pieces `bugs.ts` needs before a request reaches a handler: the shapes a body is checked
 * against, the trim that runs before that check, who may act on one report, and how a refused
 * supersede link is worded.
 *
 * Split out the same way `bugs.docs.ts` is, so the route file reads as the five endpoints it
 * registers rather than as a preamble with the endpoints at the end, and so both stay inside the
 * 300-line modularity gate.
 */
import { t } from 'elysia';
import { BUG_REPORT_STATUSES } from 'spernakit-shared';

import type { SupersedeResult } from '../services/bugReportService.ts';
import type { UserRole } from '../types/roles.ts';

import { HTTP_STATUS } from '../constants/httpStatus.ts';
import { hasMinimumRole } from '../guards/role.ts';
import { badRequestError, notFoundError } from '../utils/errorResponse.ts';

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

/**
 * Whether this account may read or relink one particular report.
 *
 * The reporter and an administrator, and nobody else. Reports are the one thing in the app an
 * unprivileged account creates and then has a reason to come back to, so the read and the supersede
 * write answer the same question the same way; a reporter who can set a link but cannot read the
 * report back has been given a control whose result they cannot see.
 *
 * The listing route is deliberately not held to this rule. Reading one report you filed is a
 * different question from reading the queue, and the queue stays ADMIN-only.
 *
 * @param reportUserId - The account that filed the report, or null for an unattributed one.
 * @param authedUser - The account making the request.
 * @returns True when the request may proceed.
 */
function mayActOn(
	reportUserId: null | number,
	authedUser: { id: number; role: UserRole },
): boolean {
	return reportUserId === authedUser.id || hasMinimumRole(authedUser.role, 'ADMIN');
}

/**
 * Turn a refused supersede link into the status and the sentence that says why.
 *
 * The service names the one thing that was wrong rather than returning a boolean, so each refusal
 * is answered in the terms the caller used: an id that is not a report is a 404 about that id, and
 * a link that would close a loop is a 400 about the link.
 *
 * @param result - The refusal from the service; the `ok` case is handled by the caller.
 * @param set - The response context, whose status this writes.
 * @returns The error body to return.
 */
function supersedeRefusal(
	result: Exclude<SupersedeResult, { kind: 'ok' }>,
	set: { status?: number | string },
) {
	if (result.kind === 'unknown-report') {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Bug report');
	}
	if (result.kind === 'unknown-successor') {
		set.status = HTTP_STATUS.NOT_FOUND;
		return notFoundError('Superseding bug report');
	}
	set.status = HTTP_STATUS.BAD_REQUEST;
	return result.kind === 'self'
		? badRequestError('A report cannot supersede itself')
		: badRequestError(
				'That report is already replaced by this one, directly or through a chain',
			);
}

export {
	MAX_DESCRIPTION_LENGTH,
	MAX_EMAIL_LENGTH,
	mayActOn,
	statusSchema,
	supersedeRefusal,
	trimSubmittedText,
};
