import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type { BugReport } from '@/lib/bugReport';

import { submitBug } from '@/api/bugs';
import { useAuth } from '@/hooks/useAuth';

/**
 * Shared layout actions consumed by Header, TopBar, and shell layouts.
 *
 * Centralizes logout-then-redirect and bug-report submission for Header.tsx
 * and TopBar.tsx.
 */
function useLayoutActions() {
	const navigate = useNavigate();
	const queryClient = useQueryClient();
	const { logout } = useAuth();

	const handleLogout = async () => {
		await logout();
		void navigate('/login');
	};

	const handleBugReport = async (report: BugReport) => {
		await submitBug(report);
		void queryClient.invalidateQueries({ queryKey: ['bugs'] });
	};

	return { handleBugReport, handleLogout };
}

export { useLayoutActions };
