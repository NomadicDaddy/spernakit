/** App feature flag shape (must match AppFeatures type in frontend/src/api/types). */
interface AppFeaturesDefaults {
	analyticsEnabled: boolean;
	bugReportEnabled: boolean;
	dashboardsEnabled: boolean;
	defaultLayoutMode: 'sidebar' | 'topbar';
	filesEnabled: boolean;
	notificationsEnabled: boolean;
	onboardingEnabled: boolean;
	superTheme: 'bbs' | 'default' | 'terminal';
	workspacesEnabled: boolean;
}

/** Default values for app feature flags — single source of truth for backend and frontend. */
const APP_FEATURES_DEFAULTS: AppFeaturesDefaults = {
	analyticsEnabled: true,
	bugReportEnabled: true,
	dashboardsEnabled: true,
	defaultLayoutMode: 'sidebar',
	filesEnabled: true,
	notificationsEnabled: true,
	onboardingEnabled: true,
	superTheme: 'default',
	workspacesEnabled: true,
};

export { APP_FEATURES_DEFAULTS };
export type { AppFeaturesDefaults };
