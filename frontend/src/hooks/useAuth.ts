import type { LoginRequest, LoginResult, UserData } from '@/api/auth';

import { getMe, login as apiLogin, logout as apiLogout } from '@/api/auth';
import { trackEvent } from '@/api/businessMetrics';
import { queryClient } from '@/lib/queryClient';
import { useAuthStore } from '@/stores/authStore';
import { useLayoutStore } from '@/stores/layoutStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useThemeStore } from '@/stores/themeStore';

/** Reset per-user UI preference stores so the next user starts from defaults. */
function resetUiPreferenceStores(): void {
	useLayoutStore.getState().reset();
	useSidebarStore.getState().reset();
	useThemeStore.getState().reset();
}

/**
 * Hook providing auth state and login/logout actions.
 * Wraps the authStore and API calls together.
 */
function useAuth() {
	const user = useAuthStore((s) => s.user);
	const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
	const setUser = useAuthStore((s) => s.setUser);
	const clearUser = useAuthStore((s) => s.logout);

	const login = async (data: LoginRequest): Promise<LoginResult> => {
		const result = await apiLogin(data);
		if (result.kind === 'success') {
			// Drop any cached data from a previous session before the new user's UI mounts.
			queryClient.clear();
			setUser(result.user);
			trackEvent({ eventCategory: 'user_action', eventName: 'login' }).catch(() => {});
		}
		return result;
	};

	const completeMfaLogin = (userData: UserData): void => {
		queryClient.clear();
		setUser(userData);
		trackEvent({ eventCategory: 'user_action', eventName: 'login' }).catch(() => {});
	};

	const logout = async (): Promise<void> => {
		await Promise.allSettled([
			trackEvent({ eventCategory: 'user_action', eventName: 'logout' }),
			apiLogout(),
		]);
		clearUser();
		resetUiPreferenceStores();
		// Clear the query cache so the next user never sees this user's cached data.
		queryClient.clear();
	};

	const checkSession = async (): Promise<boolean> => {
		const me = await getMe();
		if (me) {
			setUser(me);
			return true;
		}
		clearUser();
		return false;
	};

	return { checkSession, completeMfaLogin, isAuthenticated, login, logout, user } as const;
}

export { useAuth };
