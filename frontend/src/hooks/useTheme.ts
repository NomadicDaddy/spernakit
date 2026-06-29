import { useEffect } from 'react';

import { type ThemeMode, useThemeStore } from '@/stores/themeStore';

const MEDIA_QUERY = '(prefers-color-scheme: dark)';

/**
 * Apply the correct `dark` class and app theme class on <html>.
 * Returns the current mode/appTheme and their setters.
 */
function useTheme() {
	const mode = useThemeStore((s) => s.mode);
	const setMode = useThemeStore((s) => s.setMode);
	const appTheme = useThemeStore((s) => s.appTheme);
	const setAppTheme = useThemeStore((s) => s.setAppTheme);

	useEffect(() => {
		function apply(themeMode: ThemeMode) {
			const isDark =
				themeMode === 'dark' ||
				(themeMode === 'system' && window.matchMedia(MEDIA_QUERY).matches);

			document.documentElement.classList.toggle('dark', isDark);

			// Update color-scheme for native controls (scrollbars, form elements)
			document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';

			// Update theme-color meta tag for mobile browser chrome
			const meta = document.querySelector('meta[name="theme-color"]');
			if (meta) {
				const bg = getComputedStyle(document.documentElement)
					.getPropertyValue('--background')
					.trim();
				if (bg) {
					meta.setAttribute('content', `oklch(${bg})`);
				}
			}
		}

		apply(mode);

		if (mode === 'system') {
			const mql = window.matchMedia(MEDIA_QUERY);
			const handler = () => {
				apply('system');
			};
			mql.addEventListener('change', handler, { passive: true });
			return () => {
				mql.removeEventListener('change', handler);
			};
		}

		return undefined;
	}, [mode]);

	useEffect(() => {
		const el = document.documentElement;
		// Remove any existing theme class
		for (const cls of [...el.classList]) {
			if (cls.startsWith('theme-')) {
				el.classList.remove(cls);
			}
		}
		// Apply new theme class (default uses base palette — no class needed)
		if (appTheme !== 'default') {
			el.classList.add(`theme-${appTheme}`);
		}
	}, [appTheme]);

	return { appTheme, mode, setAppTheme, setMode } as const;
}

export { useTheme };
