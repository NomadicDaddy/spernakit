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

/** A guard call written into a route's `beforeHandle`, which Elysia reaches after validation. */
const BEFORE_HANDLE_GUARD = /beforeHandle[^\n]*require(Auth|RoleFresh)/;

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
