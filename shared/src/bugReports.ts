/**
 * Bug report kind and status identifiers. The const arrays are the runtime
 * source of truth; the literal union types are derived from them so the list
 * and type cannot drift.
 *
 * Add a new kind/status by appending to the relevant array — the Drizzle
 * schema enum (SQLite + PostgreSQL) and the frontend API types both reference
 * these constants.
 */

const BUG_REPORT_KINDS = ['bug', 'feature'] as const;

type BugReportKind = (typeof BUG_REPORT_KINDS)[number];

const BUG_REPORT_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const;

type BugReportStatus = (typeof BUG_REPORT_STATUSES)[number];

export { BUG_REPORT_KINDS, BUG_REPORT_STATUSES };
export type { BugReportKind, BugReportStatus };
