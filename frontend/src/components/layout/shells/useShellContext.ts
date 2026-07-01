import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';

import type { BugReport } from '@/lib/bugReport';

import { submitBug } from '@/api/bugs';
import { getVisibleNavItems, navItems, type NavItem } from '@/components/layout/navConfig';
import { useAppFeatures } from '@/hooks/useAppFeatures';
import { useAuth } from '@/hooks/useAuth';
import { useAuthStore } from '@/stores/authStore';
import { hasMinimumRole, type UserRole } from '@/types/roles';

interface ShellContext {
	currentPath: string;
	handleBugReport: (report: BugReport) => Promise<void>;
	handleNavigate: (path: string) => void;
	logout: () => Promise<void>;
	username: string;
	visibleNavItems: NavItem[];
}

function useShellContext(): ShellContext {
	const location = useLocation();
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { logout } = useAuth();
	const user = useAuthStore((s) => s.user);
	const userRole = user?.role ?? null;
	const { features: appFeatures } = useAppFeatures();

	const hasMinRole = (role: UserRole): boolean => {
		if (!userRole) return false;
		return hasMinimumRole(userRole, role);
	};

	const handleNavigate = (path: string) => {
		void navigate(path);
	};

	const handleBugReport = async (report: BugReport) => {
		await submitBug(report);
		void queryClient.invalidateQueries({ queryKey: ['bugs'] });
	};

	// Fail-closed: show only non-feature-gated items when features are unavailable
	const visibleNavItems = appFeatures
		? getVisibleNavItems(hasMinRole, appFeatures)
		: navItems.filter(
				(item) => !item.featureFlag && (!item.minRole || hasMinRole(item.minRole))
			);
	const currentPath = location.pathname;
	const username = user?.username ?? user?.email ?? 'user';

	return { currentPath, handleBugReport, handleNavigate, logout, username, visibleNavItems };
}

export { useShellContext };
export type { ShellContext };
