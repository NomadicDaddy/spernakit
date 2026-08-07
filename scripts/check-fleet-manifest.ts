#!/usr/bin/env bun
/**
 * Fail-closed validation for the local Spernakit fleet manifest.
 *
 * The manifest is gitignored, so every declared value is checked against tracked package metadata
 * and each app's runtime config. All versions must be concrete semantic versions.
 *
 * Enforces: every fleet-manifest entry agrees with the app it describes. No assertion ID: the
 * manifest is a gitignored local mirror and the catalog states no invariant over it.
 */
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';

import {
	applicationsRootForManifest,
	loadFleetManifest,
	validateFleetManifest,
} from './lib/fleet/manifest.ts';

export function runFleetManifest(root: string = resolve(cwd())): number {
	const manifestPath = join(root, 'spernakit.psd1');
	if (!existsSync(manifestPath)) {
		console.log(
			'[SKIP] check:fleet-manifest -- no spernakit.psd1 present, so nothing to verify.',
		);
		return 0;
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
		console.error(
			"Each app's package.json and config/<slug>.json are authoritative; spernakit.psd1 follows them.",
		);
		console.error('Repair with: bun run fleet-manifest:sync');
		console.log(`[FAIL] check:fleet-manifest -- ${problems.length} inconsistency(ies).`);
		return 1;
	}

	console.log(
		'[OK] check:fleet-manifest -- spernakit.psd1 matches every app, package, and runtime config it describes.',
	);
	return 0;
}

if (import.meta.main) exit(runFleetManifest());
