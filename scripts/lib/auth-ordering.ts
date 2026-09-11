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
 * which is how those five stayed invisible to a gate written to catch exactly them, and it named
 * no CSRF symbol at all while that plugin guarded from `beforeHandle` in every release the gate
 * was green for.
 */
const GUARDS = [
	'authorizeRequest',
	'authorizeSelectedWorkspace',
	'authorizeWorkspaceAdminParam',
	'checkSharedRateLimit',
	'enforceSharedRateLimit',
	'evaluateCsrf',
	'requireAuth',
	'requireRoleFresh',
	'requiresPasswordChangeCheck',
	'requireSelectedWorkspaceAccess',
	'requireWorkspaceAccess',
	'requireWorkspaceRole',
	'validateCsrfToken',
	'validateWorkspaceScope',
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
 * The directories whose files can put a guard on the wrong side of validation.
 *
 * Route files were the only ones read for as long as this gate existed, which is why the CSRF
 * plugin sat in `beforeHandle` through every release the gate was green for: it is not a route
 * file, so nothing looked at it. A guard is no less late for living on a plugin.
 */
const GUARDED_DIRS = [
	['backend', 'src', 'plugins'],
	['backend', 'src', 'routes'],
];

/**
 * A guard called from inside the handler of a route that declares a schema.
 *
 * The larger half of this defect class, and the half no `beforeHandle` pattern can see. Elysia
 * takes the handler before the options object, so a guard sitting between a route method and
 * that route's schema is a guard the route runs after validation. Seven sites called the
 * workspace-ADMIN guard exactly that way while this gate stayed green, because not one of them
 * used the word `beforeHandle`.
 *
 * The window stops at the next route so a guard in one route is never attributed to another,
 * and the schema can be any of body, params or query: the point is that the route validates
 * something before it has decided whether the caller may be there at all.
 */
const ROUTE_START = '\\.(?:get|post|put|patch|delete)\\(';

/** One route's worth of source: any distance that does not cross into the next route. */
const WITHIN_ROUTE = `(?:(?!${ROUTE_START})[\\s\\S]){0,4000}?`;

const IN_HANDLER_GUARD = new RegExp(
	`${ROUTE_START}${WITHIN_ROUTE}\\b(?:${GUARDS.join('|')})\\s*\\(${WITHIN_ROUTE}(?:body|params|query):\\s*t\\.`,
);

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
	return findGuardOffenders(repoRoot, BEFORE_HANDLE_GUARD);
}

/**
 * Every file that runs an authorization guard from inside a body-carrying handler.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns Repository-relative paths, empty when every such guard runs at the transform stage.
 */
function findInHandlerGuards(repoRoot: string): string[] {
	return findGuardOffenders(repoRoot, IN_HANDLER_GUARD);
}

/**
 * The same source with its comments removed.
 *
 * Every one of these patterns is a word search, and the words are ones this codebase writes
 * about constantly. The three plugins that moved their guards to the transform stage all explain
 * in prose why they no longer guard from `beforeHandle`, and a scanner that reads prose reports
 * the fix as the defect. Only whole-line `//` comments are removed so a path or a regular
 * expression sharing a line with code survives intact.
 *
 * @param source - The file contents.
 * @returns The contents with block comments and whole-line comments blanked out.
 */
function withoutComments(source: string): string {
	return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
}

/**
 * Read every guarded source file and report the ones a pattern matches.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @param pattern - The offending shape to look for.
 * @returns Repository-relative paths, sorted.
 */
function findGuardOffenders(repoRoot: string, pattern: RegExp): string[] {
	const offenders: string[] = [];
	for (const dir of GUARDED_DIRS) {
		const root = join(repoRoot, ...dir);
		for (const entry of readdirSync(root, { recursive: true, withFileTypes: true })) {
			if (!entry.isFile() || !entry.name.endsWith('.ts')) continue;
			const path = join(entry.parentPath, entry.name);
			if (pattern.test(withoutComments(readFileSync(path, 'utf8')))) {
				offenders.push(path.slice(repoRoot.length + 1).replaceAll('\\', '/'));
			}
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

export { declaredStatuses, findBeforeHandleGuards, findInHandlerGuards };
