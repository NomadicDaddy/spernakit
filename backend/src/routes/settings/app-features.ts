import { Elysia } from 'elysia';

import {
	APP_FEATURES_DEFAULTS,
	APP_FEATURES_KEYS,
	NOTIFICATION_SETTINGS_DEFAULTS,
	NOTIFICATION_SETTINGS_KEYS,
} from '../../constants/appFeatures.ts';
import { dataExample, UNAUTHORIZED_EXAMPLE } from '../../constants/responseExamples.ts';
import { requireAuth } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { type SeedDefaultEntry, getByKeys, seedDefaults } from '../../services/settingsService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { logger } from '../../utils/logger.ts';

/** All app feature + notification setting defaults for bulk seeding. */
const ALL_SETTING_DEFAULTS: SeedDefaultEntry[] = [
	{
		description: 'Show Analytics in navigation',
		key: APP_FEATURES_KEYS.analyticsEnabled,
		value: APP_FEATURES_DEFAULTS.analyticsEnabled,
	},
	{
		description: 'Show bug report button',
		key: APP_FEATURES_KEYS.bugReportEnabled,
		value: APP_FEATURES_DEFAULTS.bugReportEnabled,
	},
	{
		description: 'Show Custom Dashboards in navigation',
		key: APP_FEATURES_KEYS.dashboardsEnabled,
		value: APP_FEATURES_DEFAULTS.dashboardsEnabled,
	},
	{
		description: 'Default navigation layout mode',
		key: APP_FEATURES_KEYS.defaultLayoutMode,
		value: APP_FEATURES_DEFAULTS.defaultLayoutMode,
	},
	{
		description: 'Show Files in navigation',
		key: APP_FEATURES_KEYS.filesEnabled,
		value: APP_FEATURES_DEFAULTS.filesEnabled,
	},
	{
		description: 'Show Notifications in navigation',
		key: APP_FEATURES_KEYS.notificationsEnabled,
		value: APP_FEATURES_DEFAULTS.notificationsEnabled,
	},
	{
		description: 'Show Onboarding in navigation',
		key: APP_FEATURES_KEYS.onboardingEnabled,
		value: APP_FEATURES_DEFAULTS.onboardingEnabled,
	},
	{
		description: 'Show Workspaces in navigation',
		key: APP_FEATURES_KEYS.workspacesEnabled,
		value: APP_FEATURES_DEFAULTS.workspacesEnabled,
	},
	{
		description: 'Allow email notifications',
		key: NOTIFICATION_SETTINGS_KEYS.notificationEmailEnabled,
		value: true,
	},
	{
		description: 'Allow push notifications',
		key: NOTIFICATION_SETTINGS_KEYS.notificationPushEnabled,
		value: true,
	},
	{
		description: 'Allow system alert notifications',
		key: NOTIFICATION_SETTINGS_KEYS.notificationAlertsEnabled,
		value: true,
	},
	{
		description: 'Default: email notifications',
		key: NOTIFICATION_SETTINGS_KEYS.notificationDefaultEmail,
		value: NOTIFICATION_SETTINGS_DEFAULTS.email,
	},
	{
		description: 'Default: push notifications',
		key: NOTIFICATION_SETTINGS_KEYS.notificationDefaultPush,
		value: NOTIFICATION_SETTINGS_DEFAULTS.push,
	},
	{
		description: 'Default: security alerts',
		key: NOTIFICATION_SETTINGS_KEYS.notificationDefaultSecurity,
		value: NOTIFICATION_SETTINGS_DEFAULTS.security,
	},
	{
		description: 'Default: system alerts',
		key: NOTIFICATION_SETTINGS_KEYS.notificationDefaultSystem,
		value: NOTIFICATION_SETTINGS_DEFAULTS.system,
	},
	{
		description: 'Default: marketing emails',
		key: NOTIFICATION_SETTINGS_KEYS.notificationDefaultMarketing,
		value: NOTIFICATION_SETTINGS_DEFAULTS.marketing,
	},
];

/** Parse a boolean setting value from the settings table, logging if the row is missing or malformed. */
function parseBoolSetting(
	raw: null | string | undefined,
	failClosed: boolean,
	key: string
): boolean {
	if (!raw) {
		logger.warn(
			{ key, reason: 'missing' },
			'App feature setting row missing - using fail-closed default'
		);
		return failClosed;
	}
	try {
		return JSON.parse(raw) === true;
	} catch {
		logger.warn(
			{ key, raw, reason: 'malformed' },
			'App feature setting malformed - using fail-closed default'
		);
		return failClosed;
	}
}

/** Parse a string setting value from the settings table, logging if the row is missing or malformed. */
function parseStringSetting<T extends string>(
	raw: null | string | undefined,
	key: string,
	fallback: T,
	allowedValues: readonly T[]
): T {
	if (!raw) {
		logger.warn({ key, reason: 'missing' }, 'String setting row missing - using fallback');
		return fallback;
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		logger.warn({ key, raw, reason: 'malformed' }, 'String setting malformed - using fallback');
		return fallback;
	}
	if ((allowedValues as readonly string[]).includes(parsed as string)) return parsed as T;
	return fallback;
}
function seedAppFeatureDefaults(): void {
	seedDefaults(ALL_SETTING_DEFAULTS);
}

/** Read app feature flags from the settings table. */
function getAppFeatures(): {
	analyticsEnabled: boolean;
	bugReportEnabled: boolean;
	dashboardsEnabled: boolean;
	defaultLayoutMode: 'sidebar' | 'topbar';
	filesEnabled: boolean;
	notificationsEnabled: boolean;
	onboardingEnabled: boolean;
	workspacesEnabled: boolean;
} {
	const allKeys = Object.values(APP_FEATURES_KEYS);
	const settingsMap = getByKeys(allKeys);

	// Fail-closed defaults: when a settings row is missing or malformed, features are disabled.
	// This prevents the shared APP_FEATURES_DEFAULTS from becoming a parallel runtime authority.
	// The only runtime source of truth is the settings table.
	const analyticsEnabled = parseBoolSetting(
		settingsMap.get(APP_FEATURES_KEYS.analyticsEnabled)?.value,
		false,
		APP_FEATURES_KEYS.analyticsEnabled
	);
	const bugReportEnabled = parseBoolSetting(
		settingsMap.get(APP_FEATURES_KEYS.bugReportEnabled)?.value,
		false,
		APP_FEATURES_KEYS.bugReportEnabled
	);
	const dashboardsEnabled = parseBoolSetting(
		settingsMap.get(APP_FEATURES_KEYS.dashboardsEnabled)?.value,
		false,
		APP_FEATURES_KEYS.dashboardsEnabled
	);
	const filesEnabled = parseBoolSetting(
		settingsMap.get(APP_FEATURES_KEYS.filesEnabled)?.value,
		false,
		APP_FEATURES_KEYS.filesEnabled
	);
	const notificationsEnabled = parseBoolSetting(
		settingsMap.get(APP_FEATURES_KEYS.notificationsEnabled)?.value,
		false,
		APP_FEATURES_KEYS.notificationsEnabled
	);
	const onboardingEnabled = parseBoolSetting(
		settingsMap.get(APP_FEATURES_KEYS.onboardingEnabled)?.value,
		false,
		APP_FEATURES_KEYS.onboardingEnabled
	);
	const workspacesEnabled = parseBoolSetting(
		settingsMap.get(APP_FEATURES_KEYS.workspacesEnabled)?.value,
		false,
		APP_FEATURES_KEYS.workspacesEnabled
	);

	const layoutRaw = settingsMap.get(APP_FEATURES_KEYS.defaultLayoutMode)?.value;
	const defaultLayoutMode = parseStringSetting(
		layoutRaw,
		APP_FEATURES_KEYS.defaultLayoutMode,
		'sidebar',
		['sidebar', 'topbar']
	);

	return {
		analyticsEnabled,
		bugReportEnabled,
		dashboardsEnabled,
		defaultLayoutMode,
		filesEnabled,
		notificationsEnabled,
		onboardingEnabled,
		workspacesEnabled,
	};
}

const settingsAppFeaturesRoutes = new Elysia({
	detail: { tags: ['Settings'] },
	prefix: '/settings',
})
	.use(authPlugin)
	.get(
		'/app/features',
		({ set }) => {
			setCacheHeaders(set, 'NO_CACHE');
			return dataResponse(getAppFeatures());
		},
		{
			beforeHandle: requireAuth,
			detail: {
				description:
					'Returns app-wide feature flags that affect navigation and layout defaults. ' +
					'Available to all authenticated users (no role requirement). ' +
					'Not HTTP-cached (derived from mutable settings).',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('App feature flags', {
										defaultLayoutMode: 'sidebar',
										workspacesEnabled: true,
									}),
								},
							},
						},
						description: 'App feature flags.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
				},
				summary: 'Get app feature flags',
			},
		}
	);

export { getAppFeatures, seedAppFeatureDefaults, settingsAppFeaturesRoutes };
