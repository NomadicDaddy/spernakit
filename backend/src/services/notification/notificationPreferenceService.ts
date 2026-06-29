import { and, count, eq, isNull, or } from 'drizzle-orm';

import {
	NOTIFICATION_SETTINGS_DEFAULTS,
	NOTIFICATION_SETTINGS_KEYS,
} from '../../constants/appFeatures.ts';
import { getDb } from '../../db/index.ts';
import { notifications, userNotificationPreferences } from '../../db/schema/notifications.ts';
import { isDefined } from '../../utils/dbHelpers.ts';
import { logger } from '../../utils/logger.ts';
import { getByKeys } from '../settingsService.ts';

interface NotificationPreferences {
	emailNotifications: boolean;
	marketingEmails: boolean;
	pushNotifications: boolean;
	securityAlerts: boolean;
	systemAlerts: boolean;
}

/** Setting keys for notification defaults. */
const SETTING_KEYS = {
	email: NOTIFICATION_SETTINGS_KEYS.notificationDefaultEmail,
	marketing: NOTIFICATION_SETTINGS_KEYS.notificationDefaultMarketing,
	push: NOTIFICATION_SETTINGS_KEYS.notificationDefaultPush,
	security: NOTIFICATION_SETTINGS_KEYS.notificationDefaultSecurity,
	system: NOTIFICATION_SETTINGS_KEYS.notificationDefaultSystem,
} as const;

function parseBoolPref(value: null | string | undefined, fallback: boolean, key: string): boolean {
	if (value === undefined || value === null) {
		logger.warn(
			{ key, reason: 'missing' },
			'Notification default setting row missing — using fallback'
		);
		return fallback;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(value);
	} catch {
		logger.warn(
			{ key, raw: value, reason: 'malformed' },
			'Notification default setting malformed — using fallback'
		);
		return fallback;
	}
	if (typeof parsed === 'boolean') return parsed;

	logger.warn(
		{ key, raw: value, reason: 'malformed' },
		'Notification default setting malformed — using fallback'
	);
	return fallback;
}

/**
 * Get the default notification preferences from admin settings.
 * Falls back to canonical settings defaults if settings are not seeded.
 *
 * @returns A copy of the default notification preferences
 */
function getDefaultPreferences(): NotificationPreferences {
	const settingsMap = getByKeys(Object.values(SETTING_KEYS));

	return {
		emailNotifications: parseBoolPref(
			settingsMap.get(SETTING_KEYS.email)?.value,
			NOTIFICATION_SETTINGS_DEFAULTS.email,
			SETTING_KEYS.email
		),
		marketingEmails: parseBoolPref(
			settingsMap.get(SETTING_KEYS.marketing)?.value,
			NOTIFICATION_SETTINGS_DEFAULTS.marketing,
			SETTING_KEYS.marketing
		),
		pushNotifications: parseBoolPref(
			settingsMap.get(SETTING_KEYS.push)?.value,
			NOTIFICATION_SETTINGS_DEFAULTS.push,
			SETTING_KEYS.push
		),
		securityAlerts: parseBoolPref(
			settingsMap.get(SETTING_KEYS.security)?.value,
			NOTIFICATION_SETTINGS_DEFAULTS.security,
			SETTING_KEYS.security
		),
		systemAlerts: parseBoolPref(
			settingsMap.get(SETTING_KEYS.system)?.value,
			NOTIFICATION_SETTINGS_DEFAULTS.system,
			SETTING_KEYS.system
		),
	};
}

/**
 * Get the unread notification count for a user.
 *
 * @param userId - User ID
 * @param workspaceId - Optional workspace ID to filter by
 * @returns Unread count
 */
function getUnreadCount(userId: number, workspaceId?: null | number): number {
	const db = getDb();
	const conditions = [
		eq(notifications.userId, userId),
		eq(notifications.isDeleted, false),
		isNull(notifications.readAt),
	];
	if (isDefined(workspaceId)) {
		conditions.push(
			or(eq(notifications.workspaceId, workspaceId), isNull(notifications.workspaceId))!
		);
	}
	const result = db
		.select({ count: count() })
		.from(notifications)
		.where(and(...conditions))
		.get();

	return result?.count ?? 0;
}

/**
 * Get notification preferences for a user from database.
 * Seeds default preferences if not present.
 *
 * @param userId - User ID
 * @returns User's notification preferences
 */
function getPreferences(userId: number): NotificationPreferences {
	const db = getDb();
	const row = db
		.select()
		.from(userNotificationPreferences)
		.where(eq(userNotificationPreferences.userId, userId))
		.get();

	if (row?.preferences) {
		return {
			...getDefaultPreferences(),
			...(row.preferences as Partial<NotificationPreferences>),
		};
	}

	// Seed defaults for this user and return them
	const defaults = getDefaultPreferences();
	db.insert(userNotificationPreferences)
		.values({
			preferences: { ...defaults } as Record<string, unknown>,
			userId,
		})
		.onConflictDoNothing({ target: userNotificationPreferences.userId })
		.run();

	return defaults;
}

/**
 * Update notification preferences for a user.
 *
 * @param userId - User ID
 * @param preferences - New notification preferences
 * @returns Updated preferences
 */
function updatePreferences(
	userId: number,
	preferences: NotificationPreferences
): NotificationPreferences {
	const db = getDb();

	db.insert(userNotificationPreferences)
		.values({
			preferences: { ...preferences } as Record<string, unknown>,
			userId,
		})
		.onConflictDoUpdate({
			set: {
				preferences: { ...preferences } as Record<string, unknown>,
				updatedAt: new Date(),
			},
			target: userNotificationPreferences.userId,
		})
		.run();

	return preferences;
}

export { getPreferences, getUnreadCount, updatePreferences };
export type { NotificationPreferences };
