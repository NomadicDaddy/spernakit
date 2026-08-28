/**
 * Source-reading helpers for the workspace-header contract gate
 * (`scripts/test-workspace-header-contract.ts`).
 *
 * Three of that gate's criteria are about the shape of the codebase rather than the answer to one
 * request, so they read files instead of sending them. A request test can only prove that the two
 * routes it exercises behave; these prove that a third route cannot quietly reintroduce the
 * defect, which is the part the reported finding was actually about.
 *
 * They live here rather than in the gate so the gate stays inside the file-length limit, and
 * because each is worth running on its own when reviewing a route that has picked up the header.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * The shape that reads as a permission check and silently discards a workspace the caller named.
 *
 * `!isSysop(user) && workspaceId` looks like it is deciding who may see across workspaces, but the
 * decision has already been made by the guard. What it actually does is drop an id a SYSOP supplied
 * on purpose, so a listing narrowed to one workspace comes back holding every workspace.
 */
const DISCARDED_HEADER =
	/![A-Za-z_.]*[Ss]ysop[A-Za-z_]*(\([^)]*\))?\s*&&\s*[A-Za-z_.]*[Ww]orkspaceId/;

/** The spelling the server never publishes, which a caller who copies it cannot get read. */
const WRONG_SPELLING = 'X-Workspace-Id';

/** The messages that belong to the header guard, wherever a route needs to send one. */
const OWNED_MESSAGES = [/Missing X-Workspace/, /header is required for file operations/];

/** The one module allowed to write those messages. */
const MESSAGE_OWNER = 'backend/src/guards/workspaceHeader.ts';

/** A file the scans read, carrying the repository-relative path used to report a hit. */
interface SourceFile {
	path: string;
	text: string;
}

/**
 * Every file under a directory whose name ends in one of the given extensions.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @param relativeDir - Directory to read, relative to the root; a missing one contributes nothing.
 * @param extensions - Suffixes to keep, including the dot.
 * @returns The files, each with its repository-relative path.
 */
function readTree(repoRoot: string, relativeDir: string, extensions: string[]): SourceFile[] {
	const root = join(repoRoot, relativeDir);
	let entries;
	try {
		entries = readdirSync(root, { recursive: true, withFileTypes: true });
	} catch {
		return [];
	}
	const files: SourceFile[] = [];
	for (const entry of entries) {
		if (!entry.isFile()) continue;
		if (!extensions.some((extension) => entry.name.endsWith(extension))) continue;
		const absolute = join(entry.parentPath, entry.name);
		files.push({
			path: absolute
				.slice(repoRoot.length + 1)
				.split(sep)
				.join('/'),
			text: readFileSync(absolute, 'utf8'),
		});
	}
	return files;
}

/** Whether a line is prose rather than code, so a rule may name the shape it forbids. */
function isComment(line: string): boolean {
	const trimmed = line.trimStart();
	return trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*');
}

/**
 * Every line matching a pattern, as `path:line`, ignoring comments when asked to.
 *
 * @param files - The files to read.
 * @param pattern - The shape to look for.
 * @param options - `skipComments` leaves documentation free to name the shape it forbids.
 * @returns Repository-relative `path:line` locations, in file order.
 */
function locate(
	files: SourceFile[],
	pattern: RegExp | string,
	options: { skipComments: boolean },
): string[] {
	const hits: string[] = [];
	for (const file of files) {
		const lines = file.text.split('\n');
		for (const [index, line] of lines.entries()) {
			if (options.skipComments && isComment(line)) continue;
			const matched =
				typeof pattern === 'string' ? line.includes(pattern) : pattern.test(line);
			if (matched) hits.push(`${file.path}:${String(index + 1)}`);
		}
	}
	return hits;
}

/**
 * Every place the workspace a request named is thrown away because of who sent it.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns `path:line` locations, empty when the scope follows the header everywhere.
 */
function findDiscardedWorkspaceIds(repoRoot: string): string[] {
	const files = [
		...readTree(repoRoot, join('backend', 'src'), ['.ts']),
		...readTree(repoRoot, join('frontend', 'src'), ['.ts', '.tsx']),
	];
	return locate(files, DISCARDED_HEADER, { skipComments: true });
}

/**
 * Every place the header is spelled the way the server does not publish it.
 *
 * Prose counts here, and comments are read along with the code: an OpenAPI description or a
 * document that spells the header wrong sends a reader off to write a request that cannot work.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns `path:line` locations, empty when one spelling is used everywhere.
 */
function findWrongHeaderSpellings(repoRoot: string): string[] {
	const files = [
		...readTree(repoRoot, join('backend', 'src'), ['.ts']),
		...readTree(repoRoot, join('frontend', 'src'), ['.ts', '.tsx']),
		...readTree(repoRoot, 'docs', ['.md']),
	];
	return locate(files, WRONG_SPELLING, { skipComments: false });
}

/**
 * Every file outside the header guard that writes one of the guard's messages itself.
 *
 * A route that spells the message locally is a second answer waiting to drift from the first, which
 * is how the two phrasings this contract replaced came about.
 *
 * @param repoRoot - Absolute path to the repository root.
 * @returns `path:line` locations, empty when the guard owns every message about the header.
 */
function findUnownedHeaderMessages(repoRoot: string): string[] {
	const files = readTree(repoRoot, join('backend', 'src'), ['.ts']).filter(
		(file) => file.path !== MESSAGE_OWNER,
	);
	return OWNED_MESSAGES.flatMap((pattern) =>
		locate(files, pattern, { skipComments: false }),
	).sort((a, b) => a.localeCompare(b));
}

export { findDiscardedWorkspaceIds, findUnownedHeaderMessages, findWrongHeaderSpellings };
