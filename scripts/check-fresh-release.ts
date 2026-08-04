#!/usr/bin/env bun
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
	FRESH_RELEASE_VERSION,
	type FreshReleaseFile,
	validateFreshRelease,
} from './lib/fresh-release/validation.ts';

function trackedFiles(root: string): string[] {
	const result = Bun.spawnSync(['git', '-C', root, 'ls-files'], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) {
		throw new Error(`git ls-files failed: ${result.stderr.toString().trim()}`);
	}
	return result.stdout.toString().trim().split('\n').filter(Boolean);
}

function readPublicFiles(root: string): FreshReleaseFile[] {
	const publicPath =
		/^(?:\.github\/workflows\/release\.yml|README\.md|docs\/.*\.md|package\.json|scripts\/release-notes\.ts|spernakit\.psd1\.example)$/;
	return trackedFiles(root)
		.filter((path) => publicPath.test(path))
		.filter((path) => existsSync(resolve(root, path)))
		.map((path) => ({
			path,
			text: readFileSync(resolve(root, path), 'utf8'),
		}));
}

function main(): void {
	const root = resolve(import.meta.dir, '..');
	const packageJson = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
		version?: string;
	};
	const issues = validateFreshRelease({
		files: readPublicFiles(root),
		packageVersion: packageJson.version ?? '',
	});

	if (issues.length > 0) {
		console.error('Fresh-release contract failed:');
		for (const issue of issues) console.error(`  - ${issue}`);
		process.exit(1);
	}

	console.log(
		`Fresh-release contract passed for Spernakit v${packageJson.version} ` +
			`(public baseline v${FRESH_RELEASE_VERSION}).`,
	);
}

main();
