import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import { navItems } from '@/components/layout/navConfig';

/**
 * Last pathname announced. Module-level because LazyPage instances unmount and
 * remount on every navigation, so component-local refs would reset each time.
 * Null until the first page renders — focus is not moved on initial load.
 */
let lastAnnouncedPathname: null | string = null;

/** Convert a kebab-case path segment into a human-readable title. */
function humanizeSegment(segment: string): string {
	return segment
		.split('-')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}

/** Derive a page title from the current pathname via nav config, falling back to the last path segment. */
function derivePageTitle(pathname: string): string {
	const navMatch = navItems.find((item) => item.to === pathname);
	if (navMatch) return navMatch.label;
	const segments = pathname.split('/').filter((s) => s.length > 0 && !/^\d+$/.test(s));
	const last = segments.at(-1);
	return last ? humanizeSegment(last) : 'Home';
}

/**
 * Announce SPA route changes to assistive technology: set the document title to
 * "{page title} · {app name}" and move focus to the #main-content landmark.
 *
 * Focus is skipped on initial page load (so autofocused fields keep focus) and
 * when nested LazyPage instances re-run the effect for the same pathname.
 */
function useRouteAnnouncement(): void {
	const { pathname } = useLocation();

	useEffect(() => {
		document.title = `${derivePageTitle(pathname)} · ${__APP_NAME__}`;
		if (lastAnnouncedPathname !== null && lastAnnouncedPathname !== pathname) {
			document.getElementById('main-content')?.focus();
		}
		lastAnnouncedPathname = pathname;
	}, [pathname]);
}

export { useRouteAnnouncement };
