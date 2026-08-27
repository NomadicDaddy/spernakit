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
	itemsPerPage: number;
	layoutMode: LayoutMode;
	layoutOverridden: boolean;
	reset: () => void;
	setContainerWidth: (width: ContainerWidth) => void;
	setDensity: (density: Density) => void;
	setItemsPerPage: (count: number) => void;
	setLayoutMode: (mode: LayoutMode) => void;
	setLayoutModeFromSync: (mode: LayoutMode) => void;
}

/**
 * Rows per page before the signed-in user's saved preference arrives.
 *
 * Kept equal to `DEFAULT_USER_UI_SETTINGS.itemsPerPage` in
 * backend/src/services/user/userSettingsService.ts. The Preferences page already showed 25 as the
 * selected value while every table rendered 20 rows, because nothing read the setting at all.
 */
const DEFAULT_ITEMS_PER_PAGE = 25;

/** Initial layout values — restored on logout via {@link LayoutState.reset}. */
const LAYOUT_DEFAULTS: Pick<
	LayoutState,
	'containerWidth' | 'density' | 'itemsPerPage' | 'layoutMode' | 'layoutOverridden'
> = {
	containerWidth: 'centered',
	density: 'comfortable',
	itemsPerPage: DEFAULT_ITEMS_PER_PAGE,
	layoutMode: 'sidebar',
	layoutOverridden: false,
};

/** Layout mode, container width, density, and rows-per-page state store. */
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
			setItemsPerPage: (itemsPerPage: number) => {
				set({ itemsPerPage });
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
				if (version < 3) {
					state.itemsPerPage = state.itemsPerPage ?? DEFAULT_ITEMS_PER_PAGE;
				}
				return {
					containerWidth: (state.containerWidth as ContainerWidth) ?? 'centered',
					density: (state.density as Density) ?? 'comfortable',
					itemsPerPage: (state.itemsPerPage as number) ?? DEFAULT_ITEMS_PER_PAGE,
					layoutMode: (state.layoutMode as LayoutMode) ?? 'sidebar',
					layoutOverridden: (state.layoutOverridden as boolean) ?? false,
				};
			},
			name: STORAGE_KEYS.layout,
			storage: debouncedLocalStorage(),
			version: 3,
		},
	),
);

export { DEFAULT_ITEMS_PER_PAGE, useLayoutStore };
export type { ContainerWidth, Density, LayoutMode };
