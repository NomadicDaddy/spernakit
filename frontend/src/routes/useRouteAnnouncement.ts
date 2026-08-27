import { useEffect } from 'react';
import { useLocation, useMatches } from 'react-router';

import { navItems } from '@/components/layout/navConfig';
import { profileTabs } from '@/pages/profile/profileTabs';
import { settingsTabs } from '@/pages/settings/settingsTabs';

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

/**
 * Segments that are an identifier rather than a name — a share token, a hash, an API key id.
 *
 * The fallback below titles a page after its last path segment, which on `/dashboards/shared/:token`
 * is a 64-character hex string. The tab, the bookmark name and the history entry all read as that
 * token. Anything long and purely hexadecimal is an opaque id, never something to show a reader.
 */
const OPAQUE_SEGMENT = /^[0-9a-f]{16,}$/i;

/**
 * A title the matched route states for itself, rather than one derived from the URL.
 *
 * Only the 404 route declares one today, and that is the case the whole mechanism exists for: the
 * fallback below humanizes the last path segment of ANY pathname, so an unmatched path produced a
 * confident title naming a page that does not exist. `/settings/scheduler` rendered
 * "404 — Page not found" under "Scheduler · Spernakit v3", and `/settings/totally-made-up-page`
 * under "Totally Made Up Page · Spernakit v3" — the tab, the bookmark, the history entry and the
 * route announcement all reported that a real page had loaded while the body said the opposite.
 */
interface RouteTitleHandle {
	pageTitle: string;
}

function handleTitle(handle: unknown): null | string {
	if (typeof handle !== 'object' || handle === null) return null;
	const { pageTitle } = handle as Partial<RouteTitleHandle>;
	return typeof pageTitle === 'string' ? pageTitle : null;
}

/**
 * Every path the app already has a written name for.
 *
 * `navItems` covers the top-level destinations only, so before this map existed every sub-tab
 * fell through to `humanizeSegment` on its last path segment: /profile/api-keys announced and
 * titled itself "Api Keys", and /settings/bugs said "Bugs" while the tab the user had just
 * clicked read "Bug Reports". The tab strips are where those names are written, so they are what
 * this reads — restating the labels here, or as a `handle` on each of the seventeen route
 * objects, would drift the moment a tab is renamed.
 */
const TITLE_BY_PATH = new Map<string, string>(
	[...navItems, ...profileTabs, ...settingsTabs].map((item) => [item.to, item.label]),
);

/** Derive a page title from the current pathname via the known-route titles, falling back to the last path segment. */
function derivePageTitle(pathname: string): string {
	const known = TITLE_BY_PATH.get(pathname);
	if (known) return known;
	const segments = pathname
		.split('/')
		.filter((s) => s.length > 0 && !/^\d+$/.test(s) && !OPAQUE_SEGMENT.test(s));
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
	/*
	 * Innermost first: a nested route's own name beats an ancestor's. Only the leaf declares one
	 * today, but reading it this way means a future route can name itself without also having to
	 * out-rank whatever its parents happen to say.
	 */
	const routeTitle = useMatches().reduceRight<null | string>(
		(found, match) => found ?? handleTitle(match.handle),
		null,
	);

	useEffect(() => {
		document.title = `${routeTitle ?? derivePageTitle(pathname)} · ${__APP_NAME__}`;
		if (lastAnnouncedPathname !== null && lastAnnouncedPathname !== pathname) {
			document.getElementById('main-content')?.focus();
		}
		lastAnnouncedPathname = pathname;
	}, [pathname, routeTitle]);
}

export { useRouteAnnouncement };
