#!/usr/bin/env bun
/**
 * Fail-closed validation for the local Spernakit fleet manifest.
 *
 * The manifest is gitignored, so every declared value is checked against tracked package metadata
 * and each app's runtime config. All versions must be concrete semantic versions.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';

import {
	applicationsRootForManifest,
	loadFleetManifest,
	validateFleetManifest,
} from './lib/fleet/manifest.ts';

function main(): void {
	const root = resolve(cwd());
	const manifestPath = join(root, 'spernakit.psd1');
	if (!existsSync(manifestPath)) {
		console.log('No spernakit.psd1 present; fleet validation is not applicable.');
		return;
	}

	let problems: string[];
	try {
		const entries = loadFleetManifest(manifestPath);
		problems = validateFleetManifest(entries, applicationsRootForManifest(manifestPath));
	} catch (err) {
		problems = [err instanceof Error ? err.message : String(err)];
	}

	if (problems.length > 0) {
		console.error('spernakit.psd1 is not consistent with the live fleet:');
		for (const problem of problems) console.error(`  - ${problem}`);
		exit(1);
	}

	console.log('spernakit.psd1 matches every app, package, and runtime config it describes.');
}

main();
