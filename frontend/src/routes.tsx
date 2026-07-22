import { createBrowserRouter, Navigate } from 'react-router-dom';

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
		path: '*',
	},
]);

export { router };
