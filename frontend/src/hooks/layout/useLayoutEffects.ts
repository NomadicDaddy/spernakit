import type { AppFeaturesDefaults } from 'spernakit-shared';

import { useEffect } from 'react';

import { useLayoutStore } from '@/stores/layoutStore';

function useLayoutEffects(appFeatures: AppFeaturesDefaults | undefined): void {
	const density = useLayoutStore((s) => s.density);
	const applyDefaultLayoutMode = useLayoutStore((s) => s.applyDefaultLayoutMode);

	// Extract specific primitive fields to avoid re-running effects on unrelated object changes
	const defaultLayoutMode = appFeatures?.defaultLayoutMode;
	const superTheme = appFeatures?.superTheme;

	// Apply admin default layout for users who haven't explicitly chosen one.
	// Skipped when features are unavailable (fail-closed: no layout mutation).
	useEffect(() => {
		if (defaultLayoutMode !== undefined) {
			applyDefaultLayoutMode(defaultLayoutMode);
		}
	}, [defaultLayoutMode, applyDefaultLayoutMode]);

	// Apply super-theme attribute to document root for CSS variable consumption.
	// Skipped when features are unavailable (fail-closed: no theme mutation).
	useEffect(() => {
		if (!superTheme) return;
		const el = document.documentElement;
		if (superTheme === 'default') {
			el.removeAttribute('data-super-theme');
		} else {
			el.setAttribute('data-super-theme', superTheme);
		}
	}, [superTheme]);

	// Apply density attribute to document root for CSS variable consumption
	useEffect(() => {
		document.documentElement.dataset.density = density;
	}, [density]);
}

export { useLayoutEffects };
