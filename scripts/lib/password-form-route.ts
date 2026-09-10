/**
 * Where the password form actually lives, resolved from the frontend source.
 *
 * The onboarding checklist's "Change the default sysop password" step carries a link, and the link
 * has to land on the page that holds the form. It did not: the Change Password card moved from
 * Personal Info to Security, and the step kept pointing at Personal Info, so the one step in the
 * checklist that makes a security claim sent the operator to a page with nothing to do on it.
 *
 * Written down here as a lookup rather than a constant so the answer follows the form. If the card
 * moves again, this resolves to wherever it went and the gate that reads it fails on the step that
 * did not follow.
 *
 * @module passwordFormRoute
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The tab components that make up the account area. */
const PROFILE_PAGES = 'frontend/src/pages/profile';

/** The lazy imports that name each route's component. */
const LAZY_PAGES = 'frontend/src/routes/lazyPages.ts';

/** The route table those components are mounted in. */
const ROUTE_GROUPS = 'frontend/src/routes/routeGroups.tsx';

/** The parent path the account tabs hang off. */
const PROFILE_ROOT = '/profile';

/**
 * The account page that renders the password form.
 *
 * @param repoRoot - The repository root.
 * @returns The component name, or null when no page or more than one renders it.
 */
function passwordFormPage(repoRoot: string): null | string {
	const dir = join(repoRoot, PROFILE_PAGES);
	const holders = readdirSync(dir)
		.filter((name) => name.endsWith('.tsx'))
		.filter((name) => readFileSync(join(dir, name), 'utf-8').includes('<PasswordForm'))
		.map((name) => name.replace(/\.tsx$/, ''));
	return holders.length === 1 ? (holders[0] ?? null) : null;
}

/**
 * The route path the onboarding step has to point at to reach the password form.
 *
 * @param repoRoot - The repository root.
 * @returns The path, or null when the form or its route cannot be resolved from the source.
 */
function passwordFormRoute(repoRoot: string): null | string {
	const page = passwordFormPage(repoRoot);
	if (page === null) return null;

	// The component has to be one of the account tabs, or a same-named component mounted somewhere
	// else in the route table would answer for it.
	const lazy = readFileSync(join(repoRoot, LAZY_PAGES), 'utf-8');
	if (!lazy.includes(`'@/pages/profile/${page}'`)) return null;

	// The route's own path is the first one after the element that mounts the component.
	const routes = readFileSync(join(repoRoot, ROUTE_GROUPS), 'utf-8');
	const mountedAt = routes.indexOf(`Component={${page}} />`);
	if (mountedAt < 0) return null;

	const path = /path: '([^']+)',/.exec(routes.slice(mountedAt))?.[1];
	if (path === undefined || path.startsWith('/')) return null;

	return `${PROFILE_ROOT}/${path}`;
}

/**
 * Why an onboarding link does not reach the password form, if it does not.
 *
 * A step that opens a page with no password form on it is worse than no link: the operator follows
 * it, finds nothing to do, and has no reason to think the checklist is wrong about where the form
 * is. The destination is resolved from the frontend source rather than written down, so moving the
 * form again fails the gate that reads this instead of quietly going stale a second time.
 *
 * @param repoRoot - The repository root.
 * @param link - The link the step carries.
 * @returns One message per broken expectation, empty when the link reaches the form.
 */
function passwordStepLinkFailures(repoRoot: string, link: string): string[] {
	if (passwordFormPage(repoRoot) === null) {
		return [
			'exactly one account page renders <PasswordForm>, or there is no single destination for the step to point at',
		];
	}

	const route = passwordFormRoute(repoRoot);
	if (route === null) {
		return [
			'the page that renders the password form is mounted as one of the account tabs, so the step has a path to link to',
		];
	}

	if (link === route) return [];
	return [`the step links to ${route}, where the password form is, and not to ${link}`];
}

export { passwordFormPage, passwordFormRoute, passwordStepLinkFailures };
