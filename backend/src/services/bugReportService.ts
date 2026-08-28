import type { BugReportKind, BugReportStatus } from 'spernakit-shared';

import { and, count, desc, eq } from 'drizzle-orm';

import type { PaginatedResponse } from '../utils/dbHelpers.ts';

import { getDb } from '../db/index.ts';
import { bugReports } from '../db/schema/bugReports.ts';
import { escapeLikePattern, likeEscaped, paginatedQuery } from '../utils/dbHelpers.ts';
import { logger } from '../utils/logger.ts';
import { getUserById } from './userService.ts';

/* -------------------------------------------------------------------------- */
/*  Types                                                                      */
/* -------------------------------------------------------------------------- */

type BugReport = typeof bugReports.$inferSelect;

interface SubmitBugInput {
	description: string;
	email?: string | undefined;
	kind?: BugReportKind | undefined;
	metadata?: Record<string, unknown> | undefined;
	userId: number;
}

/** Triage filters for {@link list}. An omitted field is not constrained. */
interface ListFilters {
	kind?: BugReportKind | undefined;
	/** Free-text substring match over the report description. */
	search?: string | undefined;
	status?: BugReportStatus | undefined;
}

interface StatusUpdateResult {
	previousStatus: BugReportStatus;
	report: BugReport;
}

/** Maximum length of the auto-generated title derived from a report's description. */
const TITLE_MAX_LENGTH = 80;

/**
 * Derive a concise title from a bug report description.
 *
 * The title comes from the first line that carries something rather than from the first line, so a
 * description that opens with a blank line is still named after what it says. It is truncated to
 * TITLE_MAX_LENGTH on a word boundary when one falls close enough to the end.
 *
 * @param description - Raw description text from the submitter
 * @returns A short, single-line title derived from `description`
 */
function deriveTitle(description: string): string {
	const firstLine =
		description
			.split(/\r?\n/)
			.find((line) => line.trim().length > 0)
			?.trim() ?? '';
	// Kept for rows stored before the route began trimming the description ahead of validating
	// it. A report submitted through the API can no longer be empty here: a description that is
	// empty after trimming is answered 400 before it reaches this service.
	if (firstLine.length === 0) return '(untitled)';
	if (firstLine.length <= TITLE_MAX_LENGTH) return firstLine;

	const truncated = firstLine.slice(0, TITLE_MAX_LENGTH);
	const lastSpace = truncated.lastIndexOf(' ');
	if (lastSpace > TITLE_MAX_LENGTH / 2) {
		return `${truncated.slice(0, lastSpace)}…`;
	}
	return `${truncated}…`;
}

/**
 * Submits a new bug report.
 * Persists the report via Drizzle, enriching metadata with the reporter's username.
 *
 * @param input - Bug report submission data
 * @returns The created bug report
 */
function submit(input: SubmitBugInput): BugReport {
	const description = input.description.trim();
	const title = deriveTitle(description);
	const email = input.email?.trim() || null;
	const kind = input.kind ?? 'bug';

	const reporter = getUserById(input.userId);
	const metadata: Record<string, unknown> = {
		...(input.metadata ?? {}),
		reportedBy: {
			userId: input.userId,
			username: reporter?.username ?? `user:${input.userId}`,
		},
	};

	const db = getDb();
	const inserted = db
		.insert(bugReports)
		.values({
			description,
			email,
			kind,
			metadata,
			title,
			userId: input.userId,
		})
		.returning()
		.get();

	logger.info({ bugId: inserted.id, kind }, 'New bug report submitted');
	return inserted;
}

/**
 * Lists bug reports with pagination, newest first.
 *
 * The filters are applied in SQL rather than left to the caller because the list is paginated:
 * a triage view that filtered the twenty rows it had been handed would narrow the page, not the
 * inbox, and the total it reported alongside would be counting something else entirely.
 *
 * `search` is here for that exact reason. The triage table used to pass `searchColumn` to
 * `DataTable`, which is a client-side TanStack filter, so typing in the box hid rows from the
 * current page of twenty while the footer kept reporting the server's unfiltered total — the
 * table said "No results." above "Showing 1-2 of 2". Matching in SQL keeps the rows and the
 * count answering the same question.
 *
 * @param page - Page number (1-based)
 * @param limit - Maximum number of items per page
 * @param filters - Optional triage filters; an omitted field matches every value
 * @returns Paginated bug reports with total count
 */
function list(
	page: number,
	limit: number,
	filters: ListFilters = {},
): PaginatedResponse<BugReport> {
	const db = getDb();
	const conditions = [
		...(filters.status ? [eq(bugReports.status, filters.status)] : []),
		...(filters.kind ? [eq(bugReports.kind, filters.kind)] : []),
		...(filters.search
			? [likeEscaped(bugReports.description, `%${escapeLikePattern(filters.search)}%`)]
			: []),
	];
	const where = conditions.length > 0 ? and(...conditions) : undefined;

	return paginatedQuery(
		page,
		limit,
		(limitNum, offset) =>
			db
				.select()
				.from(bugReports)
				.where(where)
				.orderBy(desc(bugReports.createdAt))
				.limit(limitNum)
				.offset(offset)
				.all(),
		() => db.select({ count: count() }).from(bugReports).where(where).get(),
	);
}

/**
 * Updates a bug report's triage status.
 * Reads the current row and writes the new status inside a single transaction so the
 * reported previous status cannot be stale by the time it reaches the audit log.
 *
 * @param id - Bug report id
 * @param status - New status to record
 * @returns The previous status and the updated report, or undefined when no report has that id
 */
function updateStatus(id: number, status: BugReportStatus): StatusUpdateResult | undefined {
	const db = getDb();

	const result = db.transaction((tx) => {
		const existing = tx.select().from(bugReports).where(eq(bugReports.id, id)).get();
		if (!existing) return undefined;

		const report = tx
			.update(bugReports)
			.set({ status, updatedAt: new Date() })
			.where(eq(bugReports.id, id))
			.returning()
			.get();

		return { previousStatus: existing.status, report };
	});

	if (!result) return undefined;

	logger.info(
		{ bugId: id, previousStatus: result.previousStatus, status },
		'Bug report status updated',
	);
	return result;
}

export { list, submit, updateStatus };
export type { BugReport, ListFilters, StatusUpdateResult, SubmitBugInput };
