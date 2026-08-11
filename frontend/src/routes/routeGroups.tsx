import { Navigate, type RouteObject } from 'react-router';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { LazyPage } from '@/routes/LazyPage';
import {
	ApiKeysTab,
	BusinessMetricsPage,
	ConfirmEmailChangePage,
	CustomDashboardPage,
	DashboardListPage,
	DashboardPage,
	FilesPage,
	ForcePasswordChangePage,
	LoginPage,
	MfaVerifyPage,
	NotificationsPage,
	OAuthCallbackPage,
	OnboardingPage,
	PersonalInfoTab,
	PreferencesTab,
	ProfileLayout,
	RegisterPage,
	ResetPasswordConfirmPage,
	ResetPasswordPage,
	SecurityTab,
	SettingsLayout,
	SharedDashboardPage,
	VerifyEmailPage,
	WorkspaceBrandingTab,
	WorkspaceDashboardTab,
	WorkspaceGeneralTab,
	WorkspaceManagementPage,
	WorkspaceSettingsPage,
} from '@/routes/lazyPages';
import { PUBLIC_PATHS } from '@/routes/publicPaths';
import { settingsRoutes } from '@/routes/settingsRoutes';

/**
 * Public auth and shared-dashboard routes that do not require authentication.
 *
 * Paths come from `PUBLIC_PATHS` because the API layer consults the same list to decide
 * whether a 401 is a session expiry or the expected answer on an anonymous page. Two hand-kept
 * copies of that list drift, and the drift is invisible until a public route starts evicting
 * its visitors.
 */
export const publicRoutes: RouteObject[] = [
	{
		element: <LazyPage Component={LoginPage} />,
		path: PUBLIC_PATHS.login,
	},
	{
		element: <LazyPage Component={RegisterPage} />,
		path: PUBLIC_PATHS.register,
	},
	{
		element: <LazyPage Component={ForcePasswordChangePage} />,
		path: PUBLIC_PATHS.changePassword,
	},
	{
		element: <LazyPage Component={ResetPasswordPage} />,
		path: PUBLIC_PATHS.forgotPassword,
	},
	{
		element: <LazyPage Component={ResetPasswordConfirmPage} />,
		path: PUBLIC_PATHS.resetPassword,
	},
	{
		element: <LazyPage Component={OAuthCallbackPage} />,
		path: PUBLIC_PATHS.authCallback,
	},
	{
		element: <LazyPage Component={VerifyEmailPage} />,
		path: PUBLIC_PATHS.verifyEmail,
	},
	{
		element: <LazyPage Component={ConfirmEmailChangePage} />,
		path: PUBLIC_PATHS.confirmEmailChange,
	},
	{
		element: <LazyPage Component={MfaVerifyPage} />,
		path: PUBLIC_PATHS.mfaVerify,
	},
	{
		element: <LazyPage Component={SharedDashboardPage} />,
		path: PUBLIC_PATHS.sharedDashboard,
	},
];

/** Protected app routes rendered under `<ProtectedRoute />` inside the app shell. */
export const protectedAppRoutes: RouteObject[] = [
	{
		element: <Navigate replace to="/settings" />,
		path: '/admin',
	},
	{
		element: <LazyPage Component={DashboardPage} />,
		path: '/dashboard',
	},
	{
		element: <LazyPage Component={DashboardListPage} />,
		path: '/dashboards',
	},
	{
		element: <LazyPage Component={CustomDashboardPage} />,
		path: '/dashboards/:id',
	},
	{
		element: <LazyPage Component={NotificationsPage} />,
		path: '/notifications',
	},
	{
		children: [
			{
				element: <LazyPage Component={OnboardingPage} />,
				index: true,
			},
		],
		element: <ProtectedRoute requiredRole="ADMIN" />,
		path: '/onboarding',
	},
	{
		children: [
			{
				element: <LazyPage Component={BusinessMetricsPage} />,
				index: true,
			},
		],
		element: <ProtectedRoute requiredRole="OPERATOR" />,
		path: '/analytics',
	},
	{
		children: [
			{
				element: <LazyPage Component={FilesPage} />,
				index: true,
			},
		],
		element: <ProtectedRoute requiredRole="OPERATOR" />,
		path: '/files',
	},
	{
		element: <LazyPage Component={WorkspaceManagementPage} />,
		path: '/workspaces',
	},
	{
		children: [
			{
				element: <Navigate replace to="general" />,
				index: true,
			},
			{
				element: <LazyPage Component={WorkspaceGeneralTab} />,
				path: 'general',
			},
			{
				element: <LazyPage Component={WorkspaceBrandingTab} />,
				path: 'branding',
			},
			{
				element: <LazyPage Component={WorkspaceDashboardTab} />,
				path: 'dashboard',
			},
		],
		element: <LazyPage Component={WorkspaceSettingsPage} />,
		path: '/workspaces/:id/settings',
	},
	{
		children: [
			{
				element: <Navigate replace to="/profile/personal" />,
				index: true,
			},
			{
				element: <LazyPage Component={PersonalInfoTab} />,
				path: 'personal',
			},
			{
				element: <LazyPage Component={PreferencesTab} />,
				path: 'preferences',
			},
			{
				element: <LazyPage Component={SecurityTab} />,
				path: 'security',
			},
			{
				element: <LazyPage Component={ApiKeysTab} />,
				path: 'api-keys',
			},
		],
		element: <LazyPage Component={ProfileLayout} />,
		path: '/profile',
	},
	{
		children: [
			{
				children: settingsRoutes,
				element: <LazyPage Component={SettingsLayout} />,
			},
		],
		element: <ProtectedRoute requiredRole="ADMIN" />,
		path: '/settings',
	},
];
