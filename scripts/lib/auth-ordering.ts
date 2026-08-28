/**
 * Source-reading helpers for the authorization-ordering gate
 * (`scripts/test-auth-before-validation.ts`).
 *
 * Two of that gate's criteria are about the shape of the codebase rather than the behaviour of one
 * request, so they read files instead of sending them. They live here to keep the gate itself
 * within the file-length limit, and because both are useful on their own when reviewing a route
 * file that has picked up a guard.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every guard whose place is ahead of validation.
 *
 * `requireAuth` and `requireRoleFresh` answer who the caller is; the workspace guards answer
 * whether they may read the workspace they named; the shared-dashboard limit answers whether they
 * may ask at all. All of them decide something the route has no business parsing a body for, so
 * all of them belong at the transform stage, and any of them appearing in a `beforeHandle` is the
 * same regression. This list held only the first two while five sites carried the workspace guard,
 * which is how those five stayed invisible to a gate written to catch exactly them.
 */
const GUARDS = [
	'authorizeRequest',
	'authorizeSelectedWorkspace',
	'checkSharedRateLimit',
	'enforceSharedRateLimit',
	'requireAuth',
	'requireRoleFresh',
	'requireSelectedWorkspaceAccess',
	'requireWorkspaceAccess',
	'requireWorkspaceRole',
];

/**
 * A guard call written into a route's `beforeHandle`, which Elysia reaches after validation.
 *
 * Spans lines. Each converted site was written across two, with `beforeHandle` and the guard call
 * on separate lines, so a pattern anchored to one line reported nothing about any of them. The
 * window is bounded rather than open so a guard that merely appears further down the same file, in
 * a comment or in an unrelated route, is not attributed to a `beforeHandle` above it.
 */
const BEFORE_HANDLE_GUARD = new RegExp(`beforeHandle[\\s\\S]{0,200}?\\b(?:${GUARDS.join('|')})\\b`);

/**
 * Every route file that still runs an authorization guard from `beforeHandle`.
 *
 * Authorization now travels as a route option the auth plugin's macro runs at the transform stage,
 * ahead of validation. A file that guards from `beforeHandle` has gone back to validating first,
 * and no single-route request test would notice.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns Repository-relative paths, empty when every route uses the route options.
 */
function findBeforeHandleGuards(repoRoot: string): string[] {
	const routesDir = join(repoRoot, 'backend', 'src', 'routes');
	const offenders: string[] = [];
	for (const entry of readdirSync(routesDir, { recursive: true, withFileTypes: true })) {
		if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
		const path = join(entry.parentPath, entry.name);
		if (BEFORE_HANDLE_GUARD.test(readFileSync(path, 'utf8'))) {
			offenders.push(path.slice(repoRoot.length + 1).replaceAll('\\', '/'));
		}
	}
	return offenders.sort((a, b) => a.localeCompare(b));
}

/**
 * The response statuses a route's OpenAPI block promises.
 *
 * @param docs - The `detail` object a route passes to Elysia.
 * @returns The declared status codes as strings.
 */
function declaredStatuses(docs: { responses: Record<string, unknown> }): string[] {
	return Object.keys(docs.responses);
}

export { declaredStatuses, findBeforeHandleGuards };
