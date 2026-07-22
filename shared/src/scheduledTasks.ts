/**
 * Scheduled task execution status identifiers. The const array is the runtime
 * source of truth; the `ScheduledTaskStatus` literal union is derived from it
 * so the list and type cannot drift.
 *
 * Task lifecycle:
 * 1. Task starts: Record created with status='pending'
 * 2. Task runs: Status updated to 'running'
 * 3. Task completes: Status='completed'
 * 4. Task fails: Status='failed'
 *
 * Add a new status by appending to `SCHEDULED_TASK_STATUSES` — the Drizzle
 * schema enum (SQLite + PostgreSQL) and the frontend API types both reference
 * this constant.
 */

const SCHEDULED_TASK_STATUSES = ['pending', 'running', 'completed', 'failed'] as const;

type ScheduledTaskStatus = (typeof SCHEDULED_TASK_STATUSES)[number];

export { SCHEDULED_TASK_STATUSES };
export type { ScheduledTaskStatus };
