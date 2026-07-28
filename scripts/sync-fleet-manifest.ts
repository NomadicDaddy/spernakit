#!/usr/bin/env bun
/**
 * Restates the local Spernakit fleet manifest from the values that own it.
 *
 * Run this immediately after an app's version changes and before the release commit. The manifest
 * is gitignored, so nothing but this command keeps it in step with the fleet; reconciling it by
 * hand after `bun run check:fleet-manifest` already failed is how twelve entries went stale.
 *
 * Usage:
 *   bun scripts/sync-fleet-manifest.ts
 *   bun run fleet-manifest:sync
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';

import type { FleetEntry } from './lib/fleet/manifest.ts';

import {
	applicationsRootForManifest,
	loadFleetManifest,
	validateFleetManifest,
} from './lib/fleet/manifest.ts';
import { planFleetSync, renderFleetManifest } from './lib/fleet/sync.ts';

function refuse(problems: string[]): never {
	console.error('Refusing to write spernakit.psd1; the fleet could not be read in full:');
	for (const problem of problems) console.error(`  - ${problem}`);
	console.error('Every entry must resolve before any entry is written.');
	exit(1);
}

/**
 * Parses and validates the candidate text before it replaces the real manifest, so a rewrite that
 * would collide two ports or drop a required field fails here rather than landing on disk.
 */
function verify(candidate: string, applicationsRoot: string): string[] {
	const scratch = mkdtempSync(join(tmpdir(), 'spernakit-fleet-sync-'));
	const scratchPath = join(scratch, 'spernakit.psd1');
	try {
		writeFileSync(scratchPath, candidate);
		return validateFleetManifest(loadFleetManifest(scratchPath), applicationsRoot);
	} catch (err) {
		return [err instanceof Error ? err.message : String(err)];
	} finally {
		rmSync(scratch, { force: true, recursive: true });
	}
}

function main(): void {
	const manifestPath = join(resolve(cwd()), 'spernakit.psd1');
	if (!existsSync(manifestPath)) {
		console.log('No spernakit.psd1 present; fleet sync is not applicable.');
		return;
	}

	const applicationsRoot = applicationsRootForManifest(manifestPath);
	let entries: FleetEntry[];
	try {
		entries = loadFleetManifest(manifestPath);
	} catch (err) {
		refuse([err instanceof Error ? err.message : String(err)]);
	}

	const plan = planFleetSync(entries, applicationsRoot);
	if (plan.problems.length > 0) refuse(plan.problems);

	const rendered = renderFleetManifest(
		readFileSync(manifestPath, 'utf8'),
		entries,
		plan.resolved,
	);
	if (rendered.missing.length > 0) refuse(rendered.missing);
	if (rendered.changes.length === 0) {
		console.log(
			'spernakit.psd1 already matches every package and runtime config it describes.',
		);
		return;
	}

	const problems = verify(rendered.text, applicationsRoot);
	if (problems.length > 0) refuse(problems);

	writeFileSync(manifestPath, rendered.text);
	console.log(`Updated spernakit.psd1 (${rendered.changes.length} value(s)):`);
	for (const change of rendered.changes) console.log(`  - ${change}`);
}

main();
