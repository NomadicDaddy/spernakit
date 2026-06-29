import { createBrowserRouter, Navigate } from 'react-router-dom';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LazyPage } from '@/routes/LazyPage';
import {
	ApiKeysTab,
	ApplicationTab,
	AuditLogsTab,
	AuthenticationTab,
	BackupTab,
	BugsTab,
	BusinessMetricsPage,
	ConfirmEmailChangePage,
	CustomDashboardPage,
	DashboardListPage,
	DashboardPage,
	DatabaseTab,
	EmailTab,
	FilesPage,
	ForcePasswordChangePage,
	LoginPage,
	MfaVerifyPage,
	NotFoundPage,
	NotificationSettingsTab,
	NotificationsPage,
	OAuthCallbackPage,
	OnboardingPage,
	PersonalInfoTab,
	PreferencesTab,
	ProfileLayout,
	RegisterPage,
	ResetPasswordConfirmPage,
	ResetPasswordPage,
	RolesTab,
	RuntimeConfigTab,
	ScheduledTasksTab,
	SecurityTab,
	SettingsLayout,
	SharedDashboardPage,
	SystemHealthTab,
	UsersTab,
	VerifyEmailPage,
	WorkspaceManagementPage,
	WorkspaceSettingsPage,
} from '@/routes/lazyPages';

export { preloadRoute } from '@/routes/preload';

/** Application router with public auth routes, protected app routes, and shared dashboard route. */
const router = createBrowserRouter([
	// Public routes
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

	// Protected routes - require authentication
	{
		children: [
			{
				children: [
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
								children: [
									{
										element: <Navigate replace to="/settings/application" />,
										index: true,
									},
									{
										element: <LazyPage Component={ApplicationTab} />,
										path: 'application',
									},
									{
										children: [
											{
												element: <LazyPage Component={AuthenticationTab} />,
												index: true,
											},
										],
										element: <ProtectedRoute requiredRole="SYSOP" />,
										path: 'authentication',
									},
									{
										element: <LazyPage Component={UsersTab} />,
										path: 'users',
									},
									{
										element: <LazyPage Component={RolesTab} />,
										path: 'roles',
									},
									{
										element: <LazyPage Component={NotificationSettingsTab} />,
										path: 'notifications',
									},
									{
										children: [
											{
												element: <LazyPage Component={EmailTab} />,
												index: true,
											},
										],
										element: <ProtectedRoute requiredRole="SYSOP" />,
										path: 'email',
									},
									{
										element: <LazyPage Component={SystemHealthTab} />,
										path: 'system-health',
									},
									{
										element: <LazyPage Component={ScheduledTasksTab} />,
										path: 'scheduled-tasks',
									},
									{
										element: <LazyPage Component={AuditLogsTab} />,
										path: 'audit-logs',
									},
									{
										children: [
											{
												element: <LazyPage Component={BackupTab} />,
												index: true,
											},
										],
										element: <ProtectedRoute requiredRole="SYSOP" />,
										path: 'backup',
									},
									{
										children: [
											{
												element: <LazyPage Component={DatabaseTab} />,
												index: true,
											},
										],
										element: <ProtectedRoute requiredRole="SYSOP" />,
										path: 'database',
									},
									{
										children: [
											{
												element: <LazyPage Component={RuntimeConfigTab} />,
												index: true,
											},
										],
										element: <ProtectedRoute requiredRole="SYSOP" />,
										path: 'runtime-config',
									},
									{
										element: <LazyPage Component={BugsTab} />,
										path: 'bugs',
									},
								],
								element: <LazyPage Component={SettingsLayout} />,
							},
						],
						element: <ProtectedRoute requiredRole="ADMIN" />,
						path: '/settings',
					},
				],
				element: <ProtectedRoute />,
			},
		],
		element: <AppShell />,
	},

	// Default redirect
	{
		element: <Navigate replace to="/dashboard" />,
		path: '/',
	},

	// 404 page
	{
		element: <LazyPage Component={NotFoundPage} />,
		path: '*',
	},
]);

export { router };
