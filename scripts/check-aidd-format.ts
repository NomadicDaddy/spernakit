#!/usr/bin/env bun
/**
 * Format gate for the `.aidd/` metadata a derived app tracks in git.
 *
 * Enforces: tracked `.aidd/` metadata is in this repository's Prettier shape. The assertion catalog
 * has no ID for it, and `.aidd/assertions.md` is itself one of the files this gate formats.
 *
 *   bun run check:aidd-format   # fail if any metadata file is not in the repository's shape
 *   bun run format:aidd         # rewrite them in place
 *
 * Background: `/.aidd/` is excluded by `.prettierignore` — and, since Prettier 3, by `.gitignore`
 * as well, because both are default ignore paths. That is right for `bun run format`, but it makes
 * the obvious targeted invocation useless: a `prettier --check` aimed at the feature-metadata glob
 * matches zero files and prints "All matched files use Prettier code style!". A gate built on that
 * proves nothing. This script points Prettier at `scripts/aidd-prettierignore` — a tracked file
 * that ignores nothing — so the metadata is actually examined.
 *
 * Two shapes are in circulation for the same data: the repository's Prettier output (tabs, keys
 * sorted by `prettier-plugin-sort-json`) and the aidd runtime's own 2-space, id-first serializer.
 * The gate asserts the on-disk repository shape rather than accepting either, so hand-edited and
 * runtime-written metadata cannot reach a derived app's history as permanent diff churn.
 *
 * Two independent vacuity guards, because a silent pass is the failure mode being designed against:
 *   1. `.aidd/` exists but the enumeration found nothing to examine -> fail.
 *   2. Prettier itself considers any enumerated file ignored or unparseable -> fail.
 */

import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { argv, cwd, exit } from 'node:process';

const AIDD_DIR = '.aidd';

/** Relative to the repository root, which is also the Prettier working directory. */
const IGNORE_PATH = 'scripts/aidd-prettierignore';

/**
 * `.gitignore` lines that exclude the whole `.aidd` tree. The template itself ignores its own
 * `.aidd/`, so the gate has nothing to protect there; derived apps track it and do.
 */
const GITIGNORE_AIDD_LINES = new Set(['.aidd', '.aidd/', '/.aidd', '/.aidd/']);

export interface AiddFormatResult {
	/** Files Prettier reported as differing from the repository shape (or rewrote, in write mode). */
	changed: string[];
	code: number;
	/** Metadata files handed to Prettier. */
	examined: string[];
	/** Set when the project has no tracked `.aidd/` metadata for the gate to protect. */
	skippedReason?: string;
}

function toPosix(path: string): string {
	return path.split(sep).join('/');
}

function displayPath(projectRoot: string, path: string): string {
	return toPosix(relative(projectRoot, path));
}

/** The repository root of the checkout this script ships in: where `scripts/` and Prettier live. */
function scriptRoot(): string {
	return join(import.meta.dir, '..');
}

async function isAiddGitIgnored(projectRoot: string): Promise<boolean> {
	const gitignorePath = join(projectRoot, '.gitignore');
	if (!existsSync(gitignorePath)) return false;

	const text = await readFile(gitignorePath, 'utf8');
	for (const rawLine of text.split(/\r?\n/)) {
		const line = rawLine.trim();
		if (line === '' || line.startsWith('#')) continue;
		if (GITIGNORE_AIDD_LINES.has(line)) return true;
	}
	return false;
}

/**
 * `.aidd/roadmap.json` plus every `.aidd/features/<dir>/feature.json`. Enumerating those two exact
 * shapes — rather than globbing `.aidd/**` — is what keeps run artifacts (logs, iteration records,
 * screenshots, report markdown) out of the gate.
 */
export async function collectAiddMetadataFiles(projectRoot: string): Promise<string[]> {
	const files: string[] = [];

	const roadmap = join(projectRoot, AIDD_DIR, 'roadmap.json');
	if (existsSync(roadmap)) files.push(roadmap);

	const featuresDir = join(projectRoot, AIDD_DIR, 'features');
	if (existsSync(featuresDir)) {
		const entries = await readdir(featuresDir, { withFileTypes: true });
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			const featureFile = join(featuresDir, entry.name, 'feature.json');
			if (existsSync(featureFile)) files.push(featureFile);
		}
	}

	return files.sort();
}

/**
 * Guard 2: ask Prettier whether it would actually process each file under the override ignore path.
 * If `scripts/aidd-prettierignore` ever regains patterns, this reports it instead of letting the
 * run pass on an empty working set.
 */
async function findUnexaminedFiles(files: string[]): Promise<string[]> {
	const { getFileInfo } = await import('prettier');
	const unexamined: string[] = [];

	for (const file of files) {
		const info = await getFileInfo(file, {
			ignorePath: join(scriptRoot(), IGNORE_PATH),
			resolveConfig: true,
		});
		if (info.ignored || !info.inferredParser) unexamined.push(file);
	}

	return unexamined;
}

async function runPrettier(
	args: string[],
): Promise<{ code: number; stderr: string; stdout: string }> {
	const proc = Bun.spawn(['bunx', 'prettier', '--ignore-path', IGNORE_PATH, ...args], {
		cwd: scriptRoot(),
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const [stdout, stderr, code] = await Promise.all([
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
		proc.exited,
	]);
	return { code, stderr, stdout };
}

/** Exit 1 means "some files differ"; anything above that is a real Prettier failure. */
async function listDifferent(projectRoot: string, files: string[]): Promise<string[]> {
	const { code, stderr, stdout } = await runPrettier(['--list-different', ...files]);
	if (code > 1) {
		throw new Error(
			`Prettier failed on ${AIDD_DIR} metadata (exit ${code}):\n${stderr.trim()}`,
		);
	}
	return stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter((line) => line !== '')
		.map((line) => displayPath(projectRoot, join(scriptRoot(), line)));
}

function reportSkip(label: string, reason: string): AiddFormatResult {
	console.log(`[SKIP] ${label} skipped: ${reason}`);
	return { changed: [], code: 0, examined: [], skippedReason: reason };
}

export async function runAiddFormat(
	projectRoot = cwd(),
	options: { write?: boolean } = {},
): Promise<AiddFormatResult> {
	const label = options.write ? 'format:aidd' : 'check:aidd-format';

	if (!existsSync(join(projectRoot, AIDD_DIR))) {
		return reportSkip(label, `no ${AIDD_DIR}/ directory in ${toPosix(projectRoot)}.`);
	}
	if (await isAiddGitIgnored(projectRoot)) {
		return reportSkip(
			label,
			`.gitignore excludes /${AIDD_DIR}/, so its metadata never reaches this repository's history.`,
		);
	}

	const examined = await collectAiddMetadataFiles(projectRoot);
	if (examined.length === 0) {
		console.error(
			`[FAIL] ${label}: ${AIDD_DIR}/ is tracked but 0 metadata files were examined.`,
		);
		console.error(
			`Expected ${AIDD_DIR}/roadmap.json and/or ${AIDD_DIR}/features/*/feature.json. A gate that`,
		);
		console.error('examines nothing passes vacuously, so an empty working set is a failure.');
		return { changed: [], code: 1, examined };
	}

	const unexamined = await findUnexaminedFiles(examined);
	if (unexamined.length > 0) {
		console.error(
			`[FAIL] ${label}: Prettier will not examine ${unexamined.length} of ${examined.length} metadata file(s).`,
		);
		console.error(`Check that ${IGNORE_PATH} is still empty of patterns.`);
		for (const file of unexamined) console.error(`- ${displayPath(projectRoot, file)}`);
		return { changed: [], code: 1, examined };
	}

	const changed = await listDifferent(projectRoot, examined);

	if (options.write) {
		if (changed.length > 0) {
			const { code, stderr } = await runPrettier([
				'--write',
				'--log-level',
				'warn',
				...examined,
			]);
			if (code !== 0) {
				throw new Error(
					`Prettier failed to rewrite ${AIDD_DIR} metadata:\n${stderr.trim()}`,
				);
			}
		}
		console.log(
			`[OK] ${label} wrote ${changed.length} of ${examined.length} metadata file(s) examined.`,
		);
		for (const file of changed) console.log(`- ${file}`);
		return { changed, code: 0, examined };
	}

	if (changed.length > 0) {
		console.error(
			`[FAIL] ${label}: ${changed.length} of ${examined.length} metadata file(s) examined are not in the repository's Prettier shape.`,
		);
		console.error('Run `bun run format:aidd` to rewrite them.');
		for (const file of changed) console.error(`- ${file}`);
		return { changed, code: 1, examined };
	}

	console.log(`[OK] ${label} passed (${examined.length} metadata file(s) examined).`);
	return { changed, code: 0, examined };
}

if (import.meta.main) {
	const write = argv.includes('--write');
	exit((await runAiddFormat(cwd(), { write })).code);
}
