import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { AppTheme } from '@/lib/themes';

import { debouncedLocalStorage } from '@/lib/debouncedStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';

type ThemeMode = 'dark' | 'light' | 'system';

interface ThemeState {
	appTheme: AppTheme;
	mode: ThemeMode;
	reset: () => void;
	setAppTheme: (theme: AppTheme) => void;
	setMode: (mode: ThemeMode) => void;
}

/** Theme mode and app color theme state store. */
const useThemeStore = create<ThemeState>()(
	persist(
		(set) => ({
			appTheme: 'default',
			mode: 'system',
			reset: () => {
				set({ appTheme: 'default', mode: 'system' });
			},
			setAppTheme: (appTheme: AppTheme) => {
				set({ appTheme });
			},
			setMode: (mode: ThemeMode) => {
				set({ mode });
			},
		}),
		{
			migrate: (persisted) => persisted as ThemeState,
			name: STORAGE_KEYS.theme,
			storage: debouncedLocalStorage(),
			version: 1,
		}
	)
);

export { useThemeStore };
export type { ThemeMode };
