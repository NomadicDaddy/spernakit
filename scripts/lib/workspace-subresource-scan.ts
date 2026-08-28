/**
 * The source read behind the "one owner" criterion of
 * `scripts/test-workspace-subresource-existence.ts`.
 *
 * Sending requests can only prove that the routes which exist today answer correctly. The finding
 * this gate came from was not really about one route: it was about a check each route had to
 * remember to make, which meant a route added later would not make it. So the property worth
 * holding is structural. `guards/workspaceAccess.ts` owns the answer, every workspace route that
 * names a workspace in its path reaches one of its guards, and no route asks the question itself.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/** The directory whose routes all work inside a workspace named in the path. */
const ROUTE_DIR = join('backend', 'src', 'routes', 'workspaces');

/** The whole route tree, which is where a second copy of the existence check would appear. */
const ALL_ROUTES = join('backend', 'src', 'routes');

/** The guards that decide reachability and then answer for a workspace that is not there. */
const GUARDS = /\brequireWorkspace(Access|Admin|Role)\s*\(/;

/** The existence question itself, which belongs to the guards and to nothing under `routes/`. */
const EXISTENCE_CHECK = /\bworkspaceExists\s*\(/;

/** A route registration on a path that names a workspace, and the handler it was given. */
interface Registration {
	handler: string;
	line: number;
	method: string;
	path: string;
}

/** A file the scans read, carrying the repository-relative path used to report a hit. */
interface SourceFile {
	name: string;
	path: string;
	text: string;
}

/** One source file, read with the repository-relative path a report should name it by. */
function sourceFile(repoRoot: string, dir: string, name: string): SourceFile {
	return {
		name,
		path: `${dir.replaceAll('\\', '/')}/${name}`,
		text: readFileSync(join(repoRoot, dir, name), 'utf8'),
	};
}

/**
 * Every TypeScript source in the workspace route directory, minus the OpenAPI description modules.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns One entry per file, in directory order.
 */
function routeSources(repoRoot: string): SourceFile[] {
	return readdirSync(join(repoRoot, ROUTE_DIR))
		.filter((name) => name.endsWith('.ts') && !name.endsWith('.docs.ts'))
		.map((name) => sourceFile(repoRoot, ROUTE_DIR, name));
}

/**
 * Every TypeScript source anywhere under the route tree, one directory level at a time.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @param dir - Repository-relative directory to read, defaulting to the whole route tree.
 * @returns One entry per file found, including those in nested directories.
 */
function allRouteSources(repoRoot: string, dir: string = ALL_ROUTES): SourceFile[] {
	const found: SourceFile[] = [];
	for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
		if (entry.isDirectory()) found.push(...allRouteSources(repoRoot, join(dir, entry.name)));
		else if (entry.name.endsWith('.ts')) found.push(sourceFile(repoRoot, dir, entry.name));
	}
	return found;
}

/**
 * The body of the balanced brace block that starts at or after `from`.
 *
 * @param text - The whole file.
 * @param from - Index to start looking for the opening brace at.
 * @returns The text between the braces, or an empty string when there is no block.
 */
function braceBlock(text: string, from: number): string {
	const open = text.indexOf('{', from);
	if (open === -1) return '';
	let depth = 0;
	for (let i = open; i < text.length; i += 1) {
		if (text[i] === '{') depth += 1;
		else if (text[i] === '}') {
			depth -= 1;
			if (depth === 0) return text.slice(open + 1, i);
		}
	}
	return '';
}

/**
 * The index just past the balanced parameter list that starts at or after `from`.
 *
 * A handler's parameters are destructured, so the first brace after a function name belongs to the
 * parameter pattern rather than to the body. Stepping over the parameter list first is what keeps
 * the scan reading handlers instead of their arguments.
 *
 * @param text - The whole file.
 * @param from - Index to start looking for the opening parenthesis at.
 * @returns The index after the closing parenthesis, or -1 when there is no list.
 */
function afterParams(text: string, from: number): number {
	const open = text.indexOf('(', from);
	if (open === -1) return -1;
	let depth = 0;
	for (let i = open; i < text.length; i += 1) {
		if (text[i] === '(') depth += 1;
		else if (text[i] === ')') {
			depth -= 1;
			if (depth === 0) return i + 1;
		}
	}
	return -1;
}

/**
 * The source of the handler a route registration was given, inline or by name.
 *
 * A registration either carries its handler as an arrow function written in place, or names a
 * function declared above it in the same file. Both forms are read back to their body here, so the
 * caller can ask what the handler actually calls rather than what the route line looks like.
 *
 * @param text - The whole file.
 * @param afterPath - Index just past the route's path literal.
 * @returns The handler body, or an empty string when neither form was found.
 */
function handlerBody(text: string, afterPath: number): string {
	const head = text.slice(afterPath, afterPath + 200);
	const named = /^\s*,\s*([A-Za-z_$][\w$]*)\s*,/.exec(head);
	if (named) {
		const declared = new RegExp(`function\\s+${named[1]}\\s*\\(`).exec(text);
		if (!declared) return '';
		const params = afterParams(text, declared.index);
		return params === -1 ? '' : braceBlock(text, params);
	}
	const arrow = text.indexOf('=>', afterPath);
	return arrow === -1 || arrow > afterPath + 300 ? '' : braceBlock(text, arrow + 2);
}

/** Every `/:id`-scoped route registration in one file, with the handler each was given. */
function registrations(file: SourceFile): Registration[] {
	const pattern = /\.(delete|get|patch|post|put)\(\s*'(\/:id[^']*)'/g;
	const found: Registration[] = [];
	for (const match of file.text.matchAll(pattern)) {
		const index = match.index;
		found.push({
			handler: handlerBody(file.text, index + match[0].length),
			line: file.text.slice(0, index).split('\n').length,
			method: (match[1] ?? '').toUpperCase(),
			path: match[2] ?? '',
		});
	}
	return found;
}

/**
 * Workspace routes whose handler never reaches a guard, and so never learns the workspace is gone.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns One description per route that answers for a workspace without running a guard.
 */
function routesSkippingTheGuard(repoRoot: string): string[] {
	const skipped: string[] = [];
	for (const file of routeSources(repoRoot)) {
		for (const route of registrations(file)) {
			if (GUARDS.test(route.handler)) continue;
			skipped.push(`${file.path}:${String(route.line)} ${route.method} ${route.path}`);
		}
	}
	return skipped;
}

/**
 * Routes that ask whether a workspace exists themselves instead of leaving it to the guards.
 *
 * A second copy of the question is how the answers drift apart: the guards order it after the
 * access decision so the status cannot be used to probe which ids are real, and a route that asks
 * on its own is free to get that order wrong.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns One description per line under `routes/` that runs its own existence check.
 */
function existenceChecksOutsideTheGuards(repoRoot: string): string[] {
	const found: string[] = [];
	for (const file of allRouteSources(repoRoot)) {
		for (const [offset, line] of file.text.split('\n').entries()) {
			if (EXISTENCE_CHECK.test(line)) {
				found.push(`${file.path}:${String(offset + 1)} ${line.trim()}`);
			}
		}
	}
	return found;
}

/** The count of `/:id`-scoped workspace routes the scan found, so a scan that matched nothing fails. */
function scopedRouteCount(repoRoot: string): number {
	return routeSources(repoRoot).reduce((total, file) => total + registrations(file).length, 0);
}

export { existenceChecksOutsideTheGuards, routesSkippingTheGuard, scopedRouteCount };
