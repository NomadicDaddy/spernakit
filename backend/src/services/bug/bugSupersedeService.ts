/**
 * Link a corrected bug report to the one it replaces.
 *
 * A submitted report cannot be edited: the intake stores it and the only mutation the API offers
 * is a status change, which is ADMIN-only. Someone who files a report and immediately notices a
 * mistake in it has no way to correct it, so they file a second one, and the two rows sit in the
 * inbox as separate open work with the relationship stated only in the prose. Four applications in
 * one testing sweep produced that pattern.
 *
 * This records the relationship instead. The link lives on the report being replaced, which is
 * what lets the default listing leave it out with a null check, and is written by the person who
 * filed it rather than by a triager, because correcting your own mistake is the ordinary case.
 * Nothing is deleted or rewritten: the original text stays exactly as it was submitted, and the
 * only thing that changes is that the inbox knows which of the two is current.
 */
import { eq, inArray } from 'drizzle-orm';

import { getDb } from '../../db/index.ts';
import { bugReports } from '../../db/schema/bugReports.ts';
import { logger } from '../../utils/logger.ts';

type BugReport = typeof bugReports.$inferSelect;

/** A report, plus the earlier reports it was filed as a correction of. */
interface BugReportWithLinks extends BugReport {
	/**
	 * Reports this one replaces. Empty for a report that corrects nothing, which is most of them.
	 *
	 * Plural because two reports of the same thing can both be replaced by one correction, which
	 * is how a duplicate pair gets merged. The forward direction is the stored column; this is the
	 * same relationship read the other way.
	 */
	supersedesIds: number[];
}

/**
 * Why a supersede link was refused, or `ok` with the report the link now sits on.
 *
 * Each refusal names one thing so the route can choose a status and a sentence for it rather than
 * inferring both from a boolean.
 */
type SupersedeResult =
	| { kind: 'cycle' }
	| { kind: 'ok'; report: BugReport }
	| { kind: 'self' }
	| { kind: 'unknown-report' }
	| { kind: 'unknown-successor' };

/** Longest chain the cycle walk will follow before giving up and refusing the link. */
const MAX_CHAIN = 64;

/**
 * Would pointing `reportId` at `successorId` close a loop?
 *
 * Walks forward from the proposed successor along the links that already exist. Reaching the
 * report being superseded means the chain would come back to where it started, so a triager
 * following "which one is current" would go round forever. A depth ceiling covers the case where
 * a loop already exists in the table for some other reason, so this cannot hang on bad data.
 *
 * @param reportId - The report about to be marked superseded.
 * @param successorId - The report proposed as its replacement.
 * @param read - Reads one report by id, so the walk can run inside a transaction.
 * @returns True when the link would produce a cycle.
 */
function wouldCycle(
	reportId: number,
	successorId: number,
	read: (id: number) => BugReport | undefined,
): boolean {
	let current: null | number = successorId;
	for (let step = 0; step < MAX_CHAIN && current !== null; step += 1) {
		if (current === reportId) return true;
		current = read(current)?.supersededById ?? null;
	}
	return current !== null;
}

/**
 * Record that one report supersedes another, or clear an existing link.
 *
 * The whole decision runs in one transaction because it reads the chain and then writes to it;
 * two corrections filed at the same moment would otherwise each see a chain the other was about
 * to change and could between them close a loop that neither could see on its own.
 *
 * @param reportId - The report being replaced.
 * @param successorId - The report that replaces it, or null to clear the link.
 * @returns The updated report, or the reason the link was refused.
 */
function supersede(reportId: number, successorId: null | number): SupersedeResult {
	if (successorId === reportId) return { kind: 'self' };

	const db = getDb();
	const result = db.transaction((tx): SupersedeResult => {
		const read = (id: number): BugReport | undefined =>
			tx.select().from(bugReports).where(eq(bugReports.id, id)).get();

		if (!read(reportId)) return { kind: 'unknown-report' };
		if (successorId !== null) {
			if (!read(successorId)) return { kind: 'unknown-successor' };
			if (wouldCycle(reportId, successorId, read)) return { kind: 'cycle' };
		}

		const report = tx
			.update(bugReports)
			.set({ supersededById: successorId, updatedAt: new Date() })
			.where(eq(bugReports.id, reportId))
			.returning()
			.get();

		return { kind: 'ok', report };
	});

	if (result.kind === 'ok') {
		logger.info(
			{ bugId: reportId, supersededById: successorId },
			'Bug report supersede link set',
		);
	}
	return result;
}

/**
 * Fill in, for each report on the page, the earlier reports it replaces.
 *
 * One query for the whole page rather than one per row, and a query rather than a self-join in the
 * listing itself: two reports can point at the same correction, and a join would then return that
 * correction twice and make the page longer than the page size.
 *
 * @param rows - The page of reports to annotate.
 * @returns The same rows in the same order, each carrying its supersedesIds.
 */
function attachSupersedes(rows: BugReport[]): BugReportWithLinks[] {
	if (rows.length === 0) return [];

	const ids = rows.map((row) => row.id);
	const links = getDb()
		.select({ id: bugReports.id, supersededById: bugReports.supersededById })
		.from(bugReports)
		.where(inArray(bugReports.supersededById, ids))
		.all();

	const replaced = new Map<number, number[]>();
	for (const link of links) {
		if (link.supersededById === null) continue;
		replaced.set(link.supersededById, [...(replaced.get(link.supersededById) ?? []), link.id]);
	}

	return rows.map((row) => ({ ...row, supersedesIds: replaced.get(row.id) ?? [] }));
}

/**
 * The same annotation the listing applies, for a route that answers with a single report.
 *
 * Every bug route answers with one report shape, so the caller reads the relationship the same way
 * whether it listed the inbox, changed a status, or filed the correction itself.
 *
 * @param report - The report to annotate.
 * @returns The report, carrying the earlier reports it replaces.
 */
function withLinks(report: BugReport): BugReportWithLinks {
	return attachSupersedes([report])[0] ?? { ...report, supersedesIds: [] };
}

export { attachSupersedes, supersede, withLinks };
export type { BugReportWithLinks, SupersedeResult };
