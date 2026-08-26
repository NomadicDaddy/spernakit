import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router';

import type { UserRole } from '@/types/roles';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
import { lazyToast } from '@/lib/lazyToast';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { useAuthStore } from '@/stores/authStore';

interface ProtectedRouteProps {
	/**
	 * Minimum role required to access this route.
	 * If not specified, any authenticated user can access.
	 */
	requiredRole?: UserRole;
}

/**
 * Component that protects routes from unauthenticated access.
 * Redirects to login page if user is not authenticated.
 * Optionally enforces role-based access control.
 *
 * NOTE: This component uses `useLocation` from react-router for redirect state,
 * which is acceptable for auth guard components that are explicitly designed as global UI.
 * Per SSOC guidelines: "No navigation or route coupling unless explicitly designed as global UI."
 * This is a global security component that handles route protection.
 */
function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
	const location = useLocation();
	const { checkSession } = useAuth();
	const { hasMinRole, isAuthenticated, roleLabel } = useAuthorization();
	const requiresPasswordChange = useAuthStore((s) => s.user?.requiresPasswordChange);

	const { data: isValid, isLoading } = useQuery({
		enabled: isAuthenticated,
		queryFn: () => checkSession(),
		queryKey: ['session-check'],
		retry: false,
		staleTime: STALE_TIME_SHORT,
		throwOnError: false,
	});

	/*
	 * A refusal has to be visible. The role check below works and exposes nothing, but it used to
	 * redirect through a bare <Navigate>, so a user who followed a link to a page above their role
	 * landed on the dashboard with no sign that anything had been refused — indistinguishable from
	 * a stale bookmark or a broken link. The unauthenticated branch has always carried
	 * `state={{ from: location }}`; this is the same idea for the authorization branch, plus the
	 * message that makes the state worth carrying.
	 *
	 * Declared here because every hook has to run before the early returns further down. The toast
	 * id is stable, so React's development double-invoke and a second refusal on the same path both
	 * collapse into one notice.
	 */
	const isDenied =
		isAuthenticated &&
		isValid === true &&
		requiredRole !== undefined &&
		!hasMinRole(requiredRole);
	const deniedPath = location.pathname;
	const deniedRoleLabel = requiredRole ? roleLabel(requiredRole) : '';

	useEffect(() => {
		if (!isDenied) return;
		lazyToast.error('You do not have access to that page', {
			description: `${deniedPath} needs the ${deniedRoleLabel} role or higher.`,
			id: 'protected-route-denied',
		});
	}, [deniedPath, deniedRoleLabel, isDenied]);

	// Force password change for seed/demo accounts — check before loading state
	// so the redirect fires immediately from the auth store (set during login)
	// without waiting for the session-check query to resolve.
	if (isAuthenticated && requiresPasswordChange) {
		return <Navigate replace to="/change-password" />;
	}

	// Show loading state while checking session
	if (isAuthenticated && isLoading) {
		return (
			<div className="flex h-screen items-center justify-center">
				<div className="space-y-4">
					<Skeleton className="h-8 w-48" />
					<Skeleton className="h-4 w-32" />
				</div>
			</div>
		);
	}

	// Not authenticated - redirect to login
	if (!isAuthenticated || !isValid) {
		return <Navigate replace state={{ from: location }} to="/login" />;
	}

	// Check role requirement if specified. The state travels with the redirect so the
	// destination can also react to it, the way /login can read `from` above.
	if (requiredRole && !hasMinRole(requiredRole)) {
		return (
			<Navigate
				replace
				state={{ deniedFrom: location.pathname, requiredRole }}
				to="/dashboard"
			/>
		);
	}

	// Authenticated and authorized - render the protected content
	return <Outlet />;
}

export { ProtectedRoute };
