import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { debouncedLocalStorage } from '@/lib/debouncedStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';

interface SidebarState {
	collapsed: boolean;
	reset: () => void;
	setCollapsed: (collapsed: boolean) => void;
	toggle: () => void;
}

/**
 * Sidebar collapsed state store.
 *
 * PERFORMANCE: Uses debounced storage to batch writes and reduce main thread blocking.
 */
const useSidebarStore = create<SidebarState>()(
	persist(
		(set) => ({
			collapsed: false,
			reset: () => {
				set({ collapsed: false });
			},
			setCollapsed: (collapsed: boolean) => {
				set({ collapsed });
			},
			toggle: () => {
				set((state) => ({ collapsed: !state.collapsed }));
			},
		}),
		{
			migrate: (persisted) => persisted as SidebarState,
			name: STORAGE_KEYS.sidebar,
			storage: debouncedLocalStorage<SidebarState>(),
			version: 1,
		}
	)
);

export { useSidebarStore };
