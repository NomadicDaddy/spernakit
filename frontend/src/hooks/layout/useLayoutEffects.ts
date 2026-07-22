import type { AppFeaturesDefaults } from 'spernakit-shared';

import { useEffect } from 'react';

import { useLayoutStore } from '@/stores/layoutStore';

function useLayoutEffects(appFeatures: AppFeaturesDefaults | undefined): void {
	const density = useLayoutStore((s) => s.density);
	const applyDefaultLayoutMode = useLayoutStore((s) => s.applyDefaultLayoutMode);

	// Extract specific primitive fields to avoid re-running effects on unrelated object changes
	const defaultLayoutMode = appFeatures?.defaultLayoutMode;

	// Apply admin default layout for users who haven't explicitly chosen one.
	// Skipped when features are unavailable (fail-closed: no layout mutation).
	useEffect(() => {
		if (defaultLayoutMode !== undefined) {
			applyDefaultLayoutMode(defaultLayoutMode);
		}
	}, [defaultLayoutMode, applyDefaultLayoutMode]);

	// Apply density attribute to document root for CSS variable consumption
	useEffect(() => {
		document.documentElement.dataset.density = density;
	}, [density]);
}

export { useLayoutEffects };
