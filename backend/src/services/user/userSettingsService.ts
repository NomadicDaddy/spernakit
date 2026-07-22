import { Type, enumString } from '../../config/configSchemaHelpers.ts';
import { APP_FEATURES_KEYS, LAYOUT_MODES } from '../../constants/appFeatures.ts';
import { logger } from '../../utils/logger.ts';
import { parseSettingsJson } from '../../utils/validation.ts';
import { getByKeyRaw, seedDefault, update } from '../settingsService.ts';

const UserUiSettingsSchema = Type.Object({
	appTheme: Type.Optional(Type.String()),
	containerWidth: Type.Optional(enumString(['centered', 'full-width'])),
	dateFormat: Type.Optional(Type.String()),
	density: Type.Optional(enumString(['compact', 'comfortable', 'relaxed'])),
	itemsPerPage: Type.Optional(Type.Number()),
	language: Type.Optional(Type.String()),
	layoutMode: Type.Optional(enumString(['sidebar', 'topbar'])),
	sidebarCollapsed: Type.Optional(Type.Boolean()),
	theme: Type.Optional(enumString(['dark', 'light', 'system'])),
	timeFormat: Type.Optional(Type.String()),
	timezone: Type.Optional(Type.String()),
});

interface UserUiSettings {
	appTheme: string;
	containerWidth: 'centered' | 'full-width';
	dateFormat: string;
	density: 'comfortable' | 'compact' | 'relaxed';
	itemsPerPage: number;
	language: string;
	layoutMode: 'sidebar' | 'topbar';
	sidebarCollapsed: boolean;
	theme: 'dark' | 'light' | 'system';
	timeFormat: string;
	timezone: string;
}

const DEFAULT_USER_UI_SETTINGS: UserUiSettings = {
	appTheme: 'default',
	containerWidth: 'centered',
	dateFormat: 'MM/DD/YYYY',
	density: 'comfortable',
	itemsPerPage: 25,
	language: 'en',
	layoutMode: 'sidebar',
	sidebarCollapsed: false,
	theme: 'system',
	timeFormat: 'HH:mm',
	timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
};

/**
 * Get the default user UI settings, incorporating admin-configured defaults.
 * Reads `app.default_layout_mode` from settings to determine the layout default.
 *
 * @returns A copy of the default user UI settings with admin overrides applied
 */
function getDefaultUserUiSettings(): UserUiSettings {
	const defaults = { ...DEFAULT_USER_UI_SETTINGS };

	const layoutRaw = getByKeyRaw(APP_FEATURES_KEYS.defaultLayoutMode)?.value;
	if (layoutRaw) {
		try {
			const parsed: unknown = JSON.parse(layoutRaw);
			if (parsed === LAYOUT_MODES.sidebar || parsed === LAYOUT_MODES.topbar) {
				defaults.layoutMode = parsed;
			}
		} catch {
			logger.warn(
				{ key: APP_FEATURES_KEYS.defaultLayoutMode, value: layoutRaw },
				'Failed to parse default layout setting, using defaults'
			);
		}
	}

	return defaults;
}

/**
 * Get user UI settings from database.
 * Seeds default settings if not present.
 *
 * @param userId - User ID
 * @returns User UI settings
 */
function getUserUiSettings(userId: number): UserUiSettings {
	const defaults = getDefaultUserUiSettings();
	const key = `user_settings_${userId}`;

	let setting = getByKeyRaw(key);
	if (!setting) {
		seedDefault(key, defaults, 'User UI preferences');
		setting = getByKeyRaw(key);
	}

	return parseSettingsJson(
		setting?.value ?? null,
		UserUiSettingsSchema,
		defaults,
		`user UI settings for user ${userId}`
	);
}

/**
 * Update user UI settings.
 *
 * @param userId - User ID
 * @param settings - Partial user UI settings to update
 * @param updatedBy - User ID performing the update
 * @returns Updated user UI settings
 */
function updateUserUiSettings(
	userId: number,
	settings: Partial<UserUiSettings>,
	updatedBy: number
): UserUiSettings {
	const key = `user_settings_${userId}`;
	const current = getUserUiSettings(userId);
	const updated = { ...current, ...settings };
	const value = JSON.stringify(updated);

	update({ description: 'User UI preferences', key, updatedBy, value });
	return updated;
}

export { getUserUiSettings, updateUserUiSettings };
