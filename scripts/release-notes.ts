#!/usr/bin/env bun
/**
 * Build release notes for the current baseline or for a later conventional-commit range.
 *
 * A release with no predecessor uses its complete CHANGELOG entry and has no comparison link.
 * Later releases use conventional-commit subjects between two resolvable tags.
 *
 * Usage:
 *   bun scripts/release-notes.ts <tag>
 *   bun scripts/release-notes.ts <tag> --no-previous
 *   bun scripts/release-notes.ts <tag> --prev <tag> --out notes.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

/** Published sections, in the order they appear in the notes. */
const SECTIONS: readonly { heading: string; type: string }[] = [
	{ heading: 'Features', type: 'feat' },
	{ heading: 'Fixes', type: 'fix' },
	{ heading: 'Performance', type: 'perf' },
	{ heading: 'Refactoring', type: 'refactor' },
	{ heading: 'Documentation', type: 'docs' },
];

/**
 * Types omitted from the notes: they describe the repo's own plumbing, not a change a consumer
 * of the release can act on. They are still counted in the summary line, so a release made up
 * entirely of plumbing reports that honestly instead of rendering as an empty set of notes.
 */
const OMITTED_TYPES = new Set(['build', 'chore', 'ci', 'style', 'test']);

const SUBJECT = /^(?<type>[a-z]+)(?:\((?<scope>[^)]+)\))?(?<bang>!)?:\s*(?<description>.+)$/;

/** Length of the `%H` full commit hash that each `git log` line starts with. */
const SHA_LENGTH = 40;

interface ParsedCommit {
	breaking: boolean;
	description: string;
	scope: string;
	sha: string;
	type: string;
}

interface PackageMetadata {
	name?: string;
	repository?: { url?: string } | string;
}

function git(...args: string[]): string {
	return execFileSync('git', args, {
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

/** True when `ref` resolves to a commit in this clone. */
function refExists(ref: string): boolean {
	try {
		git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
		return true;
	} catch {
		return false;
	}
}

/**
 * The release preceding `tag` in version order. Sorting by `-v:refname` rather than by date is
 * deliberate: a patch tagged after a later minor would otherwise be picked as the predecessor
 * and silently widen the range.
 */
function previousTag(tag: string): null | string {
	const tags = git('tag', '--list', '--sort=-v:refname')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);
	const index = tags.indexOf(tag);
	if (index === -1) return tags.find((candidate) => candidate !== tag) ?? null;
	return tags[index + 1] ?? null;
}

function parseCommits(range: string): ParsedCommit[] {
	const raw = git('log', '--no-merges', '--format=%H %s', range);
	if (!raw) return [];

	return raw.split('\n').map((line) => {
		const sha = line.slice(0, SHA_LENGTH);
		const subject = line.slice(SHA_LENGTH + 1);
		const groups = SUBJECT.exec(subject)?.groups;
		const breakingFooter = groups?.['bang'] === '!';
		return {
			breaking: breakingFooter,
			// A subject that is not conventional-commit shaped keeps its full text and lands
			// in "Other changes" rather than being dropped on the floor.
			description: groups?.['description'] ?? subject,
			scope: groups?.['scope'] ?? '',
			sha: sha.slice(0, 7),
			type: groups?.['type'] ?? '',
		};
	});
}

function renderEntry(commit: ParsedCommit): string {
	const scope = commit.scope ? `**${commit.scope}:** ` : '';
	return `- ${scope}${commit.description} (\`${commit.sha}\`)`;
}

function packageMetadata(): PackageMetadata {
	return JSON.parse(
		readFileSync(new URL('../package.json', import.meta.url), 'utf8')
	) as PackageMetadata;
}

/** Scope first, then description, so related changes read together within a section. */
function byScopeThenDescription(a: ParsedCommit, b: ParsedCommit): number {
	return a.scope.localeCompare(b.scope) || a.description.localeCompare(b.description);
}

function repositoryUrl(): string {
	let repository: string | undefined;
	try {
		repository = git('remote', 'get-url', 'origin');
	} catch {
		const configured = packageMetadata().repository;
		repository = typeof configured === 'string' ? configured : configured?.url;
	}
	if (!repository) throw new Error('No origin remote or package.json repository URL was found.');
	return repository
		.replace(/^git@github\.com:/, 'https://github.com/')
		.replace(/^ssh:\/\/git@github\.com\//, 'https://github.com/')
		.replace(/\.git$/, '');
}

export function renderBaselineNotes(changelog: string, tag: string): string {
	const version = tag.startsWith('v') ? tag.slice(1) : tag;
	const lines = changelog.split(/\r?\n/);
	const headingIndex = lines.findIndex((line) => line.startsWith(`## [${version}]`));
	if (headingIndex === -1) {
		throw new Error(`CHANGELOG.md has no entry for ${version}.`);
	}
	const nextHeading = lines.findIndex(
		(line, index) => index > headingIndex && /^## \[\d+\.\d+\.\d+]/.test(line)
	);
	const body = lines
		.slice(headingIndex + 1, nextHeading === -1 ? undefined : nextHeading)
		.join('\n');
	const normalized = body.trim();
	if (!normalized) throw new Error(`CHANGELOG.md entry for ${version} is empty.`);
	return `${normalized}\n`;
}

function buildBaselineNotes(tag: string): string {
	const changelog = readFileSync(
		new URL('../docs/template/CHANGELOG.md', import.meta.url),
		'utf8'
	);
	return renderBaselineNotes(changelog, tag);
}

function isSpernakitTemplate(): boolean {
	return packageMetadata().name === 'spernakit';
}

function buildNotes(tag: string, previous: null | string): string {
	if (!previous && isSpernakitTemplate()) return buildBaselineNotes(tag);

	const range = previous ? `${previous}..${tag}` : tag;
	const commits = parseCommits(range);
	const lines: string[] = [];

	const breaking = commits.filter((commit) => commit.breaking);
	if (breaking.length > 0) {
		lines.push('### ⚠ Breaking changes', '');
		for (const commit of [...breaking].sort(byScopeThenDescription)) {
			lines.push(renderEntry(commit));
		}
		lines.push('');
	}

	for (const section of SECTIONS) {
		const matching = commits
			.filter((commit) => commit.type === section.type && !commit.breaking)
			.sort(byScopeThenDescription);
		if (matching.length === 0) continue;
		lines.push(`### ${section.heading}`, '');
		for (const commit of matching) lines.push(renderEntry(commit));
		lines.push('');
	}

	const published = new Set([...SECTIONS.map((section) => section.type)]);
	const other = commits
		.filter((commit) => !commit.breaking)
		.filter((commit) => !published.has(commit.type) && !OMITTED_TYPES.has(commit.type))
		.sort(byScopeThenDescription);
	if (other.length > 0) {
		lines.push('### Other changes', '');
		for (const commit of other) lines.push(renderEntry(commit));
		lines.push('');
	}

	const omitted = commits.filter((commit) => OMITTED_TYPES.has(commit.type)).length;
	const summary = [`${commits.length} commit${commits.length === 1 ? '' : 's'}`];
	if (previous) summary.push(`since ${previous}`);
	if (omitted > 0) summary.push(`(${omitted} omitted as build/chore/ci plumbing)`);
	lines.push(`_${summary.join(' ')}._`, '');

	const url = repositoryUrl();
	if (previous && !refExists(previous)) {
		throw new Error(`Previous tag "${previous}" does not resolve.`);
	}
	lines.push(
		previous
			? `**Full Changelog**: ${url}/compare/${previous}...${tag}`
			: `**Repository at release**: ${url}/commits/${tag}`
	);

	return `${lines.join('\n')}\n`;
}

/** Flags that consume the argument after them, which must not be mistaken for the tag. */
const VALUE_FLAGS = new Set(['--out', '--prev']);

function main(): void {
	const args = argv.slice(2);
	const prevFlag = args.indexOf('--prev');
	const outFlag = args.indexOf('--out');
	const noPrevious = args.includes('--no-previous');

	// Skip both the flags and the values they consume. Without this, `--out notes.md` with no
	// tag would silently treat "notes.md" as the tag and fail with a confusing ref error.
	const tag = args.find(
		(arg, index) => !arg.startsWith('--') && !VALUE_FLAGS.has(args[index - 1] ?? '')
	);
	if (!tag) {
		console.error(
			'usage: bun scripts/release-notes.ts <tag> [--prev <tag> | --no-previous] [--out <file>]'
		);
		exit(1);
	}
	if (noPrevious && prevFlag !== -1) {
		console.error('release-notes: --prev and --no-previous cannot be used together.');
		exit(1);
	}
	if (prevFlag !== -1 && !args[prevFlag + 1]) {
		console.error('release-notes: --prev requires a tag.');
		exit(1);
	}
	if (outFlag !== -1 && !args[outFlag + 1]) {
		console.error('release-notes: --out requires a file path.');
		exit(1);
	}

	const previous = noPrevious
		? null
		: prevFlag === -1
			? previousTag(tag)
			: (args[prevFlag + 1] ?? null);

	if (!refExists(tag)) {
		console.error(`release-notes: tag "${tag}" does not resolve in this clone.`);
		exit(1);
	}

	const notes = buildNotes(tag, previous);
	const out = outFlag === -1 ? null : args[outFlag + 1];
	if (out) {
		writeFileSync(out, notes, 'utf8');
		console.log(`release-notes: wrote ${out} for ${tag}.`);
	} else {
		console.log(notes);
	}
}

if (import.meta.main) main();
