#!/usr/bin/env bun
/**
 * Audit for app-authored lines a template upgrade deleted.
 *
 * A template upgrade copies template content over app files. `check-template-drift.ts` reports what
 * diverges from the template afterwards, and its `--target-version` mode reports what the template
 * dropped that the app kept. Neither answers the inverse question this asks: did the copy delete a
 * line the app wrote that the template never had?
 *
 * Nothing else can answer it. During the 2026-07-27 upgrade round one derived app lost twenty lines
 * and nine commits of navigation entries and the whole gate chain stayed green, because a dropped
 * nav entry typechecks, lints, builds and serves. Another lost an app-added field from a shared API
 * type and was caught only because one page happened to consume it. A green `smoke:qc` is not
 * evidence that app-owned work survived an upgrade.
 *
 * Run it against the upgrade commit, after the template copy and before the release commit. A
 * non-zero exit is blocking: every reported line is app work the copy removed, and each one is
 * either restored or deliberately dropped before the release is cut.
 *
 * Usage:
 *   bun scripts/audit-lost-lines.ts --app-dir ../myapp
 *   bun scripts/audit-lost-lines.ts --app-dir ../myapp --rev 9e576dc
 *   bun run audit:lost-lines -- --app-dir ../myapp --rev 9e576dc --template .
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { argv, exit } from 'node:process';

import type { LostLineFinding } from './lib/template/lost-lines.ts';

import { auditLostLines } from './lib/template/lost-lines.ts';
import { resolveSpernakitPath } from './lib/template/repo.ts';

interface Options {
	appDir: string;
	rev: string;
	template: string | undefined;
}

const USAGE = 'Usage: bun run audit:lost-lines -- --app-dir <path> [--rev <commit>]';

function fail(message: string): never {
	console.error(`   ${message}`);
	exit(1);
}

function parseArgs(): Options {
	const args = argv.slice(2);
	const valueOf = (flag: string): string | undefined => {
		const index = args.indexOf(flag);
		if (index === -1) return undefined;
		const value = args[index + 1];
		if (value === undefined || value.startsWith('--'))
			fail(`${flag} requires a value. ${USAGE}`);
		return value;
	};

	const appDir = valueOf('--app-dir');
	if (appDir === undefined) fail(`--app-dir is required. ${USAGE}`);
	return {
		appDir: resolve(appDir),
		rev: valueOf('--rev') ?? 'HEAD',
		template: valueOf('--template'),
	};
}

/** One-line description of the audited commit, so the report names what it judged. */
function describeCommit(appDir: string, rev: string): null | string {
	const result = Bun.spawnSync(['git', '-C', appDir, 'log', '-1', '--format=%h %s', rev], {
		stderr: 'pipe',
		stdout: 'pipe',
	});
	if (result.exitCode !== 0) return null;
	const described = result.stdout.toString().trim();
	return described === '' ? null : described;
}

/**
 * Print one finding: the app path, every removed line, and every post-init commit that touched the
 * path. The commits are the evidence that the path is app work rather than untouched template
 * content, so they belong in the report next to what was lost, not in a summary count.
 */
function printFinding(finding: LostLineFinding): void {
	const count = finding.lines.length;
	console.log(`   ${finding.filePath}`);
	console.log(`      ${count} removed line${count === 1 ? '' : 's'} no template revision had:`);
	for (const line of finding.lines) console.log(`         ${line}`);
	console.log(`      touched after init by:`);
	for (const commit of finding.commits) console.log(`         ${commit.sha}  ${commit.subject}`);
	console.log('');
}

function main(): void {
	const { appDir, rev, template } = parseArgs();
	if (!existsSync(join(appDir, '.git'))) fail(`--app-dir is not a git repository: ${appDir}`);

	const templateDir = resolveSpernakitPath(template, appDir);
	if (templateDir === null) {
		fail('the spernakit template repository is required to classify removed lines');
	}

	const described = describeCommit(appDir, rev);
	if (described === null) fail(`could not resolve --rev ${rev} in ${appDir}`);

	console.log(`Auditing app-authored lines lost at ${described}`);
	console.log(`   App:      ${appDir}`);
	console.log(`   Template: ${templateDir}`);
	console.log('');

	let findings: LostLineFinding[];
	try {
		findings = auditLostLines({ appDir, rev, templateDir });
	} catch (err: unknown) {
		fail(`Lost-lines audit failed: ${err instanceof Error ? err.message : String(err)}`);
	}

	if (findings.length === 0) {
		console.log('   No app-authored lines lost');
		exit(0);
	}

	console.log(`LOST APP LINES (${findings.length} file${findings.length === 1 ? '' : 's'})`);
	console.log('');
	for (const finding of findings) printFinding(finding);
	console.log('   Restore each line or drop it deliberately before the release commit.');
	exit(1);
}

main();
