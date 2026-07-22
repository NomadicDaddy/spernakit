/**
 * Business event category identifiers. The const array is the runtime source
 * of truth; the `EventCategory` literal union is derived from it so the list
 * and type cannot drift.
 *
 * Event categories:
 * - user_action: Login, logout, profile update, password change
 * - conversion: Registration, workspace creation, file upload
 * - feature_usage: Page view, feature interaction, API endpoint call
 *
 * Add a new category by appending to `EVENT_CATEGORIES` — the Drizzle schema
 * enum (SQLite + PostgreSQL) and the frontend API type both reference this
 * constant.
 */

const EVENT_CATEGORIES = ['user_action', 'conversion', 'feature_usage'] as const;

type EventCategory = (typeof EVENT_CATEGORIES)[number];

export { EVENT_CATEGORIES };
export type { EventCategory };
