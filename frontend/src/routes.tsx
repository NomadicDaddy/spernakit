import { createBrowserRouter, Navigate } from 'react-router';

import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { LazyPage } from '@/routes/LazyPage';
import { NotFoundPage } from '@/routes/lazyPages';
import { protectedAppRoutes, publicRoutes } from '@/routes/routeGroups';

export { preloadRoute } from '@/routes/preload';

/** Application router with public auth routes, protected app routes, and shared dashboard route. */
const router = createBrowserRouter([
	// Public routes
	...publicRoutes,

	// Protected routes - require authentication
	{
		children: [
			{
				children: protectedAppRoutes,
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
		/*
		 * `handle` is how this route tells `useRouteAnnouncement` its own name. Without it the title
		 * was derived from the raw pathname, which titles every 404 after a page that does not
		 * exist: `/settings/scheduler` rendered "404 — Page not found" under the tab title
		 * "Scheduler · Spernakit v3". A `handle` is react-router's own channel for route metadata
		 * and travels with the match, so an unmatched path is recognised rather than guessed at.
		 */
		handle: { pageTitle: 'Page not found' },
		path: '*',
	},
]);

export { router };
