import { useQuery } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import type { UserRole } from '@/types/roles';

import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useAuthorization } from '@/hooks/useAuthorization';
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
 * NOTE: This component uses `useLocation` from react-router-dom for redirect state,
 * which is acceptable for auth guard components that are explicitly designed as global UI.
 * Per SSOC guidelines: "No navigation or route coupling unless explicitly designed as global UI."
 * This is a global security component that handles route protection.
 */
function ProtectedRoute({ requiredRole }: ProtectedRouteProps) {
	const location = useLocation();
	const { checkSession } = useAuth();
	const { hasMinRole, isAuthenticated } = useAuthorization();
	const requiresPasswordChange = useAuthStore((s) => s.user?.requiresPasswordChange);

	const { data: isValid, isLoading } = useQuery({
		enabled: isAuthenticated,
		queryFn: () => checkSession(),
		queryKey: ['session-check'],
		retry: false,
		staleTime: STALE_TIME_SHORT,
		throwOnError: false,
	});

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

	// Check role requirement if specified
	if (requiredRole && !hasMinRole(requiredRole)) {
		// User is authenticated but lacks required role
		// Redirect to dashboard with insufficient privileges
		return <Navigate replace to="/dashboard" />;
	}

	// Authenticated and authorized - render the protected content
	return <Outlet />;
}

export { ProtectedRoute };
