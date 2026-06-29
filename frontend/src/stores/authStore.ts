import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { UserData } from '@/api/auth';

import { resetPasswordChangeToast } from '@/api/errorHandling';
import { resetLoggingOutGuard } from '@/api/tokenRefresh';
import { debouncedSessionStorage } from '@/lib/debouncedStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';
import { useWorkspaceStore } from '@/stores/workspaceStore';
import { resetSessionId } from '@/utils/correlationId';

interface AuthState {
	csrfToken: null | string;
	isAuthenticated: boolean;
	isSessionVerified: boolean;
	logout: () => void;
	setCsrfToken: (token: string) => void;
	setUser: (user: UserData) => void;
	user: null | UserData;
}

/**
 * Authentication state store.
 *
 * SECURITY: Uses sessionStorage instead of localStorage to mitigate XSS risks.
 * Session storage is cleared when the browser session ends, reducing the window
 * for stolen data. The real authentication is via HTTP-only cookies - this store
 * only caches UI state for better UX. ProtectedRoute always verifies with server.
 *
 * PERFORMANCE: Uses debounced storage to batch writes and reduce main thread blocking.
 */
const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			csrfToken: null,
			isAuthenticated: false,
			isSessionVerified: false,
			logout: () => {
				resetSessionId();
				resetPasswordChangeToast();
				useWorkspaceStore.getState().setActiveWorkspaceId(null);
				set({
					csrfToken: null,
					isAuthenticated: false,
					isSessionVerified: false,
					user: null,
				});
			},
			setCsrfToken: (token: string) => {
				set({ csrfToken: token });
			},
			setUser: (user: UserData) => {
				resetLoggingOutGuard();
				set({ isAuthenticated: true, isSessionVerified: true, user });
			},
			user: null,
		}),
		{
			migrate: (persisted) => persisted as Pick<AuthState, 'isAuthenticated' | 'user'>,
			name: STORAGE_KEYS.auth,
			partialize: (state) => ({
				isAuthenticated: state.isAuthenticated,
				user: state.user,
			}),
			// CSRF token is intentionally NOT persisted — it stays in volatile Zustand state only.
			// On page refresh, the token is re-obtained from /auth/refresh or /auth/me response headers.
			// This prevents token leakage via sessionStorage if an XSS vulnerability exists.
			storage: debouncedSessionStorage<Pick<AuthState, 'isAuthenticated' | 'user'>>(),
			version: 2,
		}
	)
);

export { useAuthStore };
