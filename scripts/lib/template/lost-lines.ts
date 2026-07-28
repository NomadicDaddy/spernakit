/**
 * Detection of app-authored lines a template upgrade deleted.
 *
 * `check-template-drift.ts` answers "does the app still match what the template ships?" and
 * `deletions.ts` answers "does the app still carry what the template dropped?". Neither answers the
 * question an upgrade actually raises: the copy pass writes template bytes over an app file, so what
 * did the app have in there that nobody asked to remove?
 *
 * A green `smoke:qc` is not an answer. During the 2026-07-27 upgrade round one derived app lost
 * twenty lines and nine commits of navigation entries from its layout config and every gate stayed
 * green — a dropped nav entry typechecks, lints, builds, and serves. Another lost an app-added field
 * from a shared API type and was caught only because one page happened to consume it.
 *
 * The classifier is the template's own history. For every line the commit removed from a
 * template-managed path, ask whether ANY revision of the corresponding template path ever contained
 * it. A line the template once had is stale template content, and replacing it is the entire point
 * of an upgrade. A line the template never had was written by the app.
 *
 * That test alone is too loud, because a file seeded from a pre-3.28.2 template is full of lines no
 * surviving template blob contains — those tags were squashed away. The app's own history settles
 * it: a path whose only commits are the root `init` and earlier template syncs carries nothing but
 * copied template content, whether or not a surviving blob can still prove it. Only a path an app
 * commit touched is work the upgrade had no licence to drop.
 */
import { isFileExcluded, isScaffoldMapped, toTemplatePath } from './classify.ts';
import { findRemovedLines, normalizeLine } from './text.ts';

/** Record separator for `git log --format`, emitted as `%x00`. */
const RECORD_SEPARATOR = '\u0000';

/**
 * Subjects of commits that copied template bytes in rather than writing app work.
 *
 * Covers the two conventions the fleet actually uses: the `chore(template):` scope, and the
 * `chore: sync spernakit template to vX.Y.Z` message `docs/template/DEVELOPMENT.md` prescribes.
 */
const TEMPLATE_SYNC_SUBJECT = /^chore\(template\):|^chore:\s+(sync|upgrade)\b.*\bspernakit\b/i;

export interface AppCommit {
	sha: string;
	subject: string;
}

export interface LostLineFinding {
	/** Post-init app commits that touched this path, newest first. Never empty. */
	commits: AppCommit[];
	filePath: string;
	/** Removed lines, in file order, that no template revision of this path ever contained. */
	lines: string[];
}

export interface LostLinesInput {
	appDir: string;
	/** The commit to audit; compared against its first parent. */
	rev: string;
	templateDir: string;
}

function git(cwd: string, args: string[]): null | string {
	const result = Bun.spawnSync(['git', '-C', cwd, ...args], { stderr: 'pipe', stdout: 'pipe' });
	if (result.exitCode !== 0) return null;
	return result.stdout.toString();
}

/**
 * True when the path belongs to the surface a template upgrade copies over.
 *
 * Mirrors how `enumerateTemplateFiles` builds that surface: everything the drift checker manages,
 * plus the scaffold-mapped paths (`.gitignore`, `.prettierignore`, `.githooks/*`) which
 * `isFileExcluded` rejects at their app location because the template keeps them under
 * `scaffolding/`.
 */
export function isTemplateManagedPath(appPath: string): boolean {
	return isScaffoldMapped(appPath) || !isFileExcluded(appPath);
}

/**
 * True when a commit subject describes a template copy rather than app work.
 *
 * An earlier upgrade touching a path is not evidence that the path holds app work — it is evidence
 * of the opposite. Without this the rule below reads `docs/template/CHANGELOG.md` as app-authored in
 * every app that has ever been upgraded, and the trim from a full history to the last five releases
 * lands as two thousand lost lines. Those lines were template content whose blobs the pre-3.28.2
 * squash took with it, which is exactly the ambiguity the app's own history is supposed to settle.
 */
export function isTemplateSyncSubject(subject: string): boolean {
	return TEMPLATE_SYNC_SUBJECT.test(subject.trim());
}

/** The oldest parentless commit reachable from `rev` — the app's `init`. */
function findRootCommit(appDir: string, rev: string): null | string {
	const out = git(appDir, ['rev-list', '--max-parents=0', rev]);
	const roots = (out ?? '').trim().split('\n').filter(Boolean);
	return roots.at(-1) ?? null;
}

/**
 * Every path touched between the root commit (exclusive) and `rev^`, mapped to the commits that
 * touched it. One `git log` for the whole range — a per-path query would be one process per changed
 * file, which on a real upgrade commit is several hundred.
 *
 * The range stops at `rev^` deliberately: `rev` is the upgrade itself and touches every path it
 * overwrote, so including it would qualify every file as app work. Earlier upgrades are dropped for
 * the same reason, by subject — see isTemplateSyncSubject.
 */
function collectPostInitCommits(appDir: string, range: string): Map<string, AppCommit[]> {
	const commits = new Map<string, AppCommit[]>();
	const out = git(appDir, ['log', '--no-renames', '--format=%x00%H %s', '--name-only', range]);
	if (out === null) return commits;

	for (const block of out.split(RECORD_SEPARATOR)) {
		const lines = block.split('\n');
		const header = lines.shift();
		if (header === undefined || header.trim() === '') continue;
		const separator = header.indexOf(' ');
		const commit: AppCommit = {
			sha: (separator === -1 ? header : header.slice(0, separator)).slice(0, 7),
			subject: separator === -1 ? '' : header.slice(separator + 1),
		};
		if (isTemplateSyncSubject(commit.subject)) continue;
		for (const filePath of lines) {
			if (filePath.trim() === '') continue;
			const touched = commits.get(filePath) ?? [];
			touched.push(commit);
			commits.set(filePath, touched);
		}
	}
	return commits;
}

/**
 * Every line that ever existed at `templatePath` in the template repository, normalized.
 *
 * Returns null when no revision of the path exists, which means the path is not template content at
 * all. Those are out of scope: the copy pass cannot have written a file the template does not have,
 * so any line the commit removed from one is an ordinary app edit that happened to ride along.
 *
 * `rev-list --all` scopes the blob fetch to the commits that actually touched the path — usually a
 * handful — and one `cat-file --batch` reads them all in a single process.
 */
export function collectTemplateLines(
	templateDir: string,
	templatePath: string,
): null | Set<string> {
	const revs = git(templateDir, ['rev-list', '--all', '--', templatePath]);
	const shas = (revs ?? '').trim().split('\n').filter(Boolean);
	if (shas.length === 0) return null;

	const result = Bun.spawnSync(['git', '-C', templateDir, 'cat-file', '--batch'], {
		stderr: 'pipe',
		stdin: Buffer.from(`${shas.map((sha) => `${sha}:${templatePath}`).join('\n')}\n`),
		stdout: 'pipe',
	});
	if (result.exitCode !== 0) return null;

	const lines = new Set<string>();
	const buffer = result.stdout;
	let offset = 0;
	while (offset < buffer.length) {
		const newline = buffer.indexOf(0x0a, offset);
		if (newline === -1) break;
		const header = buffer.toString('utf8', offset, newline).split(' ');
		offset = newline + 1;
		// `<oid> missing` has no body — the path did not exist in that revision's tree.
		const size = header.length < 3 ? Number.NaN : Number(header[2]);
		if (Number.isNaN(size)) continue;
		for (const line of buffer.toString('utf8', offset, offset + size).split('\n')) {
			const normalized = normalizeLine(line);
			if (normalized.trim() !== '') lines.add(normalized);
		}
		offset += size + 1;
	}
	return lines;
}

/**
 * Paths the commit modified or deleted. Renames are read as a delete plus an add, because the
 * question is asked per app path: content that left `frontend/src/x.ts` left that file.
 */
function changedPaths(appDir: string, rev: string): string[] {
	const out = git(appDir, [
		'diff',
		'--name-only',
		'--no-renames',
		'--diff-filter=MD',
		`${rev}^`,
		rev,
	]);
	if (out === null) throw new Error(`could not diff ${rev}^..${rev} in ${appDir}`);
	return out.trim().split('\n').filter(Boolean);
}

/**
 * Findings for one commit, sorted by path.
 *
 * The filters are ordered by cost, not by importance: the two path-level gates (template-managed,
 * touched after init) are decided from data already in hand, and only the survivors pay for blob
 * reads. On a real upgrade commit that is a few files out of several hundred.
 */
export function auditLostLines(input: LostLinesInput): LostLineFinding[] {
	const { appDir, rev, templateDir } = input;
	const root = findRootCommit(appDir, rev);
	if (root === null) throw new Error(`could not resolve a root commit from ${rev} in ${appDir}`);

	const postInit = collectPostInitCommits(appDir, `${root}..${rev}^`);
	const findings: LostLineFinding[] = [];

	for (const filePath of changedPaths(appDir, rev).sort()) {
		const commits = postInit.get(filePath);
		if (commits === undefined || !isTemplateManagedPath(filePath)) continue;

		const before = git(appDir, ['show', `${rev}^:${filePath}`]) ?? '';
		const removed = findRemovedLines(before, git(appDir, ['show', `${rev}:${filePath}`]) ?? '');
		if (removed.length === 0) continue;

		const templateLines = collectTemplateLines(templateDir, toTemplatePath(filePath));
		if (templateLines === null) continue;

		const lines = removed.filter((line) => !templateLines.has(normalizeLine(line)));
		if (lines.length > 0) findings.push({ commits, filePath, lines });
	}
	return findings;
}
