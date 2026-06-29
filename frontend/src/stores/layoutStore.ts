import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { debouncedLocalStorage } from '@/lib/debouncedStorage';
import { STORAGE_KEYS } from '@/lib/storageKeys';

type ContainerWidth = 'centered' | 'full-width';
type Density = 'comfortable' | 'compact' | 'relaxed';
type LayoutMode = 'sidebar' | 'topbar';

interface LayoutState {
	applyDefaultLayoutMode: (mode: LayoutMode) => void;
	containerWidth: ContainerWidth;
	density: Density;
	layoutMode: LayoutMode;
	layoutOverridden: boolean;
	reset: () => void;
	setContainerWidth: (width: ContainerWidth) => void;
	setDensity: (density: Density) => void;
	setLayoutMode: (mode: LayoutMode) => void;
	setLayoutModeFromSync: (mode: LayoutMode) => void;
}

/** Initial layout values — restored on logout via {@link LayoutState.reset}. */
const LAYOUT_DEFAULTS: Pick<
	LayoutState,
	'containerWidth' | 'density' | 'layoutMode' | 'layoutOverridden'
> = {
	containerWidth: 'centered',
	density: 'comfortable',
	layoutMode: 'sidebar',
	layoutOverridden: false,
};

/** Layout mode, container width, and density state store. */
const useLayoutStore = create<LayoutState>()(
	persist(
		(set, get) => ({
			applyDefaultLayoutMode: (mode: LayoutMode) => {
				if (!get().layoutOverridden) {
					set({ layoutMode: mode });
				}
			},
			...LAYOUT_DEFAULTS,
			reset: () => {
				set(LAYOUT_DEFAULTS);
			},
			setContainerWidth: (containerWidth: ContainerWidth) => {
				set({ containerWidth });
			},
			setDensity: (density: Density) => {
				set({ density });
			},
			setLayoutMode: (layoutMode: LayoutMode) => {
				set({ layoutMode, layoutOverridden: true });
			},
			setLayoutModeFromSync: (layoutMode: LayoutMode) => {
				set({ layoutMode });
			},
		}),
		{
			migrate: (persisted, version) => {
				const state = persisted as Record<string, unknown>;
				// Sequential migrations: add new `if (version < N)` blocks when bumping version
				if (version < 1) {
					state.layoutOverridden = true;
				}
				if (version < 2) {
					state.density = state.density ?? 'comfortable';
				}
				return {
					containerWidth: (state.containerWidth as ContainerWidth) ?? 'centered',
					density: (state.density as Density) ?? 'comfortable',
					layoutMode: (state.layoutMode as LayoutMode) ?? 'sidebar',
					layoutOverridden: (state.layoutOverridden as boolean) ?? false,
				};
			},
			name: STORAGE_KEYS.layout,
			storage: debouncedLocalStorage(),
			version: 2,
		}
	)
);

export { useLayoutStore };
export type { ContainerWidth, Density, LayoutMode };
