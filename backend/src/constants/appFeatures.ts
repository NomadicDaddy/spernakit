import { APP_FEATURES_DEFAULTS } from 'spernakit-shared';

/** Setting keys for app feature flags (returned by /app/features endpoint). */
const APP_FEATURES_KEYS = {
	analyticsEnabled: 'app.analytics_enabled',
	bugReportEnabled: 'app.bug_report_enabled',
	dashboardsEnabled: 'app.dashboards_enabled',
	defaultLayoutMode: 'app.default_layout_mode',
	filesEnabled: 'app.files_enabled',
	notificationsEnabled: 'app.notifications_enabled',
	onboardingEnabled: 'app.onboarding_enabled',
	workspacesEnabled: 'app.workspaces_enabled',
} as const;

/** Setting keys for notification defaults (consumed via general /settings API). */
const NOTIFICATION_SETTINGS_KEYS = {
	notificationAlertsEnabled: 'app.notification_alerts_enabled',
	notificationDefaultEmail: 'app.notification_default_email',
	notificationDefaultMarketing: 'app.notification_default_marketing',
	notificationDefaultPush: 'app.notification_default_push',
	notificationDefaultSecurity: 'app.notification_default_security',
	notificationDefaultSystem: 'app.notification_default_system',
	notificationEmailEnabled: 'app.notification_email_enabled',
	notificationPushEnabled: 'app.notification_push_enabled',
} as const;

/**
 * Explicit allowlist of setting keys that the generic PUT /api/v1/settings/:key
 * endpoint may create or modify. Sourced from the canonical runtime key maps so
 * it stays in sync with the settings the UI actually edits, rather than a
 * hand-maintained string list. Any key outside this set is rejected with a 400.
 */
const WRITABLE_SETTING_KEYS: ReadonlySet<string> = new Set<string>([
	...Object.values(APP_FEATURES_KEYS),
	...Object.values(NOTIFICATION_SETTINGS_KEYS),
]);

/** Default notification preference values seeded into settings and used as fallback values. */
const NOTIFICATION_SETTINGS_DEFAULTS = {
	email: true,
	marketing: false,
	push: true,
	security: true,
	system: true,
} as const;

/** Valid layout mode values for user UI settings and admin defaults. */
const LAYOUT_MODES = {
	sidebar: 'sidebar',
	topbar: 'topbar',
} as const;

export {
	APP_FEATURES_DEFAULTS,
	APP_FEATURES_KEYS,
	LAYOUT_MODES,
	NOTIFICATION_SETTINGS_DEFAULTS,
	NOTIFICATION_SETTINGS_KEYS,
	WRITABLE_SETTING_KEYS,
};
