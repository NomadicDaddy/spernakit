/**
 * The fixture harness for `scripts/test-template-features.ts`.
 *
 * The sync's rules are only worth anything if the shipped CLI applies them, so the assertions grade
 * the real `scripts/sync-template-features.ts` on its exit code, its output and the bytes it leaves
 * on disk. That needs a real template repo and a real app directory, and the corpus has to be rich
 * enough to exercise every row of the classification table in a single run — otherwise a rule can
 * pass in isolation and still be unreachable in practice. That scaffolding lives here so the test
 * file holds assertions.
 *
 * Fixtures are built under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing
 * tracked. The location is also load-bearing: writes go through Prettier with the config resolved
 * from the destination path, and only a fixture inside the repository resolves one. Callers must
 * invoke `cleanup()` in a `finally`.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { execPath, env as processEnv } from 'node:process';

import {
	APP_FEATURES,
	APP_ROADMAP,
	TEMPLATE_FEATURES,
	TEMPLATE_ROADMAP,
	TEMPLATE_VERSION,
} from './fixture-corpus.ts';

const REPO_ROOT = join(import.meta.dir, '..', '..', '..');
const CLI = join(REPO_ROOT, 'scripts', 'sync-template-features.ts');

export interface SyncRun {
	exitCode: number;
	/** stdout only, so `--json` output can be parsed without stderr spliced into it. */
	stdout: string;
	/** stdout and stderr together, for message assertions. */
	text: string;
}

export function scratchDir(prefix: string): string {
	const parent = join(REPO_ROOT, 'tmp');
	mkdirSync(parent, { recursive: true });
	return mkdtempSync(join(parent, prefix));
}

export function writeText(root: string, relPath: string, content: string): void {
	const target = join(root, relPath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

export function writeJson(root: string, relPath: string, value: unknown): void {
	writeText(root, relPath, `${JSON.stringify(value, null, '\t')}\n`);
}

export function readText(root: string, relPath: string): null | string {
	try {
		return readFileSync(join(root, relPath), 'utf8');
	} catch {
		return null;
	}
}

export function readJson(root: string, relPath: string): Record<string, unknown> {
	const raw = readText(root, relPath);
	if (raw === null) throw new Error(`${relPath} is missing under ${root}`);
	return JSON.parse(raw) as Record<string, unknown>;
}

export function removePath(root: string, relPath: string): void {
	rmSync(join(root, relPath), { force: true, recursive: true });
}

/** Run the shipped CLI from `cwdDir`. `bun` is taken from this process so PATH is irrelevant. */
export function runSync(
	cwdDir: string,
	args: string[],
	extraEnv: Record<string, string> = {},
): SyncRun {
	const result = Bun.spawnSync([execPath, CLI, ...args], {
		cwd: cwdDir,
		env: { ...processEnv, ...extraEnv },
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const stdout = result.stdout.toString();
	return { exitCode: result.exitCode, stdout, text: `${stdout}${result.stderr.toString()}` };
}

export interface FeatureFixture {
	appRoot: string;
	cleanup: () => void;
	/** The scratch parent. Anything written under it is removed by `cleanup`. */
	root: string;
	templateRoot: string;
}

/** Build a spernakit-shaped template and a derived app at version parity with it. */
export function createFeatureFixture(): FeatureFixture {
	const root = scratchDir('template-features-');
	const templateRoot = join(root, 'template');
	const appRoot = join(root, 'app');

	writeJson(templateRoot, 'package.json', { name: 'spernakit', version: TEMPLATE_VERSION });
	// `resolveSpernakitPath` accepts a directory only when it looks like a git checkout; the sync
	// never shells out to git, so an empty directory is enough to satisfy that test.
	mkdirSync(join(templateRoot, '.git'), { recursive: true });
	for (const [dirName, record] of Object.entries(TEMPLATE_FEATURES)) {
		writeJson(templateRoot, `.aidd/features/${dirName}/feature.json`, record);
	}
	writeJson(templateRoot, '.aidd/roadmap.json', TEMPLATE_ROADMAP);

	writeJson(appRoot, 'package.json', {
		name: 'fixture-app',
		spernakit_version: TEMPLATE_VERSION,
		version: '0.1.0',
	});
	for (const [dirName, record] of Object.entries(APP_FEATURES)) {
		writeJson(appRoot, `.aidd/features/${dirName}/feature.json`, record);
	}
	// A second file is what separates `pruned` from `prune-blocked`: the sync deletes a directory
	// only when `feature.json` is all that would be lost.
	writeText(appRoot, '.aidd/features/stale-blocked-copy/NOTES.md', '# kept by hand\n');
	writeJson(appRoot, '.aidd/roadmap.json', APP_ROADMAP);

	return {
		appRoot,
		cleanup: () => rmSync(root, { force: true, recursive: true }),
		root,
		templateRoot,
	};
}
