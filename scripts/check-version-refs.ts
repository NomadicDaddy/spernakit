#!/usr/bin/env bun
/**
 * Version Reference Check
 *
 * Guards the template's *current-state* version claims against `package.json`.
 * The README title and baseline sentences sat at v3.29.0 across seven releases
 * because nothing bumped them and nothing checked them — `release:notes` writes
 * the changelog, not the prose around it.
 *
 * Only claims that assert "this is the version shipping right now" are checked.
 * Deliberately NOT checked, because they are correct while frozen:
 *   - support floors ("the minimum supported template synchronization source")
 *   - historical prose ("the v3.29.0 public baseline")
 *   - provenance stamps on plans and review packets
 *
 * Every site is required to match. A reworded README fails loudly rather than
 * silently disabling its own gate — update the pattern in the same change.
 *
 * Template-only: derived apps keep branded READMEs under a `KEEP README.md`
 * override, so the prose these patterns target does not exist there.
 *
 * Usage:
 *   bun scripts/check-version-refs.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { projectRoot } from '../backend/src/config/configUtils.ts';

interface ClaimSite {
	/** Repository-relative path. */
	file: string;
	/** What the claim asserts, for failure output. */
	label: string;
	/** Must contain exactly one capture group: the version. */
	pattern: RegExp;
	/** 'first' checks only the earliest match; 'all' checks every match. */
	scope?: 'all' | 'first';
}

const CLAIM_SITES: ClaimSite[] = [
	{
		file: 'README.md',
		label: 'README title',
		pattern: /^# Spernakit v(\d+\.\d+\.\d+)$/gm,
	},
	{
		file: 'README.md',
		label: 'current template baseline sentence',
		pattern: /Spernakit v(\d+\.\d+\.\d+) is the current template baseline\./g,
	},
	{
		file: 'README.md',
		label: 'overview sentence',
		pattern: /Spernakit v(\d+\.\d+\.\d+) is a full-stack/g,
	},
	{
		file: 'docs/template/README.md',
		label: 'docs "as it ships today" sentence',
		pattern: /the Spernakit v(\d+\.\d+\.\d+) application template as it ships today/g,
	},
	{
		file: 'docs/template/CHANGELOG.md',
		label: 'newest changelog entry',
		pattern: /^## \[(\d+\.\d+\.\d+)\]/gm,
		scope: 'first',
	},
];

interface Failure {
	actual: string;
	file: string;
	label: string;
}

function readPackageVersion(): string {
	const raw = readFileSync(join(projectRoot, 'package.json'), 'utf8');
	const { version } = JSON.parse(raw) as { version?: string };
	if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) {
		throw new Error(`package.json version is missing or not semver: ${String(version)}`);
	}
	return version;
}

function checkSite(site: ClaimSite, expected: string, failures: Failure[]): void {
	const contents = readFileSync(join(projectRoot, site.file), 'utf8');
	const matches = [...contents.matchAll(site.pattern)];

	if (matches.length === 0) {
		failures.push({
			actual: 'no match — pattern is stale',
			file: site.file,
			label: site.label,
		});
		return;
	}

	const checked = site.scope === 'first' ? matches.slice(0, 1) : matches;
	for (const match of checked) {
		const found = match[1];
		if (found !== expected) {
			failures.push({ actual: String(found), file: site.file, label: site.label });
		}
	}

	if (!failures.some((f) => f.file === site.file && f.label === site.label)) {
		console.log(`[OK  ] ${site.file} — ${site.label} (v${expected})`);
	}
}

function main(): void {
	const expected = readPackageVersion();
	const failures: Failure[] = [];

	for (const site of CLAIM_SITES) {
		checkSite(site, expected, failures);
	}

	for (const failure of failures) {
		console.log(`[FAIL] ${failure.file} — ${failure.label}: ${failure.actual}`);
	}

	if (failures.length > 0) {
		console.log(
			`\nFix: package.json is v${expected}. Update the claims above to match, or ` +
				'update the pattern in scripts/check-version-refs.ts when the prose ' +
				'legitimately changed. Support floors and historical references are not ' +
				'checked here and should stay frozen.',
		);
		process.exit(1);
	}

	console.log(`\n[OK] All ${CLAIM_SITES.length} version claims match package.json v${expected}.`);
	process.exit(0);
}

main();
