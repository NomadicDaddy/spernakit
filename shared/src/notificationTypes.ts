/**
 * Notification type values. The const array is the runtime source of truth;
 * the `NotificationType` literal union is derived from it so it cannot drift.
 *
 * Add a new notification type by appending to `NOTIFICATION_TYPES` only —
 * backend Drizzle enum, TypeBox schema, service input, and frontend union
 * all reference the shared constant.
 */

const NOTIFICATION_TYPES = [
	'info',
	'success',
	'warning',
	'error',
	'system',
	'security',
	'marketing',
] as const;

type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export { NOTIFICATION_TYPES };
export type { NotificationType };
