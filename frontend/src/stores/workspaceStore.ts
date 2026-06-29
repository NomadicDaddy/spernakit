import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { debouncedLocalStorage } from '@/lib/debouncedStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';

interface WorkspaceState {
	activeWorkspaceId: null | number;
	setActiveWorkspaceId: (id: null | number) => void;
}

/**
 * Workspace selection state store.
 *
 * DESIGN: Only activeWorkspaceId is persisted. Workspace list data comes from
 * TanStack Query cache via useWorkspace hook to avoid dual source of truth.
 *
 * PERFORMANCE: Uses debounced storage to batch writes and reduce main thread blocking.
 */
const useWorkspaceStore = create<WorkspaceState>()(
	persist(
		(set) => ({
			activeWorkspaceId: null,
			setActiveWorkspaceId: (id: null | number) => {
				set({ activeWorkspaceId: id });
			},
		}),
		{
			migrate: (persisted) => persisted as WorkspaceState,
			name: STORAGE_KEYS.workspace,
			storage: debouncedLocalStorage<WorkspaceState>(),
			version: 1,
		}
	)
);

export { useWorkspaceStore };
