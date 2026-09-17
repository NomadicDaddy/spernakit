interface FeatureToggleConfig {
	/** Only where the row carries a constraint the card header does not already state. */
	description?: string;
	key: string;
	label: string;
	settingKey: string;
}

/*
 * Labels are the navigation item's own name, not a sentence about it.
 *
 * Every row used to read "<Name> in navigation" over "Show the <Name> item in the navigation for
 * all users" — the phrase "in navigation" appeared thirteen times in one card whose header already
 * says where these items appear, and six of the seven descriptions were one
 * sentence with a noun swapped. The three rows that genuinely differ — Analytics, Onboarding and
 * the bug report button — had their real constraint buried in that boilerplate. Now they are the
 * only rows with a description, so the distinction is what stands out instead of what is hidden.
 */
const FEATURE_TOGGLES: FeatureToggleConfig[] = [
	{ key: 'workspaces', label: 'Workspaces', settingKey: 'app.workspaces_enabled' },
	{ key: 'files', label: 'Files', settingKey: 'app.files_enabled' },
	{ key: 'dashboards', label: 'Custom Dashboards', settingKey: 'app.dashboards_enabled' },
	{
		description: 'Authorized users only',
		key: 'analytics',
		label: 'Analytics',
		settingKey: 'app.analytics_enabled',
	},
	{ key: 'notifications', label: 'Notifications', settingKey: 'app.notifications_enabled' },
	{
		description: 'Admin users only',
		key: 'onboarding',
		label: 'Onboarding',
		settingKey: 'app.onboarding_enabled',
	},
	{
		description: 'Shown in the header',
		key: 'bugReport',
		label: 'Bug report button',
		settingKey: 'app.bug_report_enabled',
	},
];

export { FEATURE_TOGGLES };
export type { FeatureToggleConfig };
