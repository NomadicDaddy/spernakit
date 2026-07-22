/**
 * Map of route paths to their dynamic import functions for preloading.
 * Focused on heavy pages with large dependencies (recharts, react-grid-layout, etc.).
 */
const routeImportMap: Record<string, () => Promise<unknown>> = {
	'/analytics': () => import('@/pages/analytics/BusinessMetricsPage'),
	'/dashboard': () => import('@/pages/dashboard/DashboardPage'),
	'/dashboards': () => import('@/pages/dashboards/DashboardListPage'),
	'/files': () => import('@/pages/files/FilesPage'),
	'/notifications': () => import('@/pages/notifications/NotificationsPage'),
	'/onboarding': () => import('@/pages/onboarding/OnboardingPage'),
	'/settings': () => import('@/pages/settings/SettingsLayout'),
	'/workspaces': () => import('@/pages/workspaces/WorkspaceManagementPage'),
};

const preloadedRoutes = new Set<string>();

/**
 * Preload a route's chunk on hover/focus to reduce perceived latency.
 * Deduplicates calls — each route is only preloaded once per session.
 */
function preloadRoute(path: string): void {
	if (preloadedRoutes.has(path)) return;
	const importFn = routeImportMap[path];
	if (importFn) {
		preloadedRoutes.add(path);
		void importFn();
	}
}

/**
 * Preload the CustomDashboardPage chunk (includes react-grid-layout + recharts).
 * Used by DashboardCard hover/focus to start downloading the heaviest page early.
 */
function preloadDashboardRoute(): void {
	const key = '/dashboards/:id';
	if (preloadedRoutes.has(key)) return;
	preloadedRoutes.add(key);
	void import('@/pages/dashboards/CustomDashboardPage');
}

export { preloadDashboardRoute, preloadRoute };
