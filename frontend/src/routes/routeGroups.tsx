import { Navigate, type RouteObject } from 'react-router-dom';

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
	WorkspaceManagementPage,
	WorkspaceSettingsPage,
} from '@/routes/lazyPages';
import { settingsRoutes } from '@/routes/settingsRoutes';

/** Public auth and shared-dashboard routes that do not require authentication. */
export const publicRoutes: RouteObject[] = [
	{
		element: <LazyPage Component={LoginPage} />,
		path: '/login',
	},
	{
		element: <LazyPage Component={RegisterPage} />,
		path: '/register',
	},
	{
		element: <LazyPage Component={ForcePasswordChangePage} />,
		path: '/change-password',
	},
	{
		element: <LazyPage Component={ResetPasswordPage} />,
		path: '/forgot-password',
	},
	{
		element: <LazyPage Component={ResetPasswordConfirmPage} />,
		path: '/reset-password',
	},
	{
		element: <LazyPage Component={OAuthCallbackPage} />,
		path: '/auth/callback',
	},
	{
		element: <LazyPage Component={VerifyEmailPage} />,
		path: '/verify-email',
	},
	{
		element: <LazyPage Component={ConfirmEmailChangePage} />,
		path: '/confirm-email-change',
	},
	{
		element: <LazyPage Component={MfaVerifyPage} />,
		path: '/mfa-verify',
	},
	{
		element: <LazyPage Component={SharedDashboardPage} />,
		path: '/dashboards/shared/:token',
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
