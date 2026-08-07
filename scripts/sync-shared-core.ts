#!/usr/bin/env bun
/**
 * sync-shared-core.ts — one mechanism for every file this fleet shares between peer repositories.
 *
 * Today this is the READ-ONLY half. `--check` compares each manifest group's targets against its
 * owner and reports; there is no write path yet, and running with no arguments does nothing except
 * say so. The write path lands per group, absorbing sync-license-core.ts, install-leak-guard.ts and
 * install-history-guard.ts one at a time, each kept working as a thin delegate until its group has
 * been through one clean --check cycle. Design: common/gatesync.md, section 3a.
 *
 * OWNER VERSUS RUNNER. This script is itself a shared file present in more than one repository, so
 * it cannot infer ownership from where it is running — that would make whichever repository you
 * happened to be standing in the source of truth. Every group names its owner, and the write path
 * (when it exists) will push only the groups the running repository owns. `--check` is exempt and
 * verifies every group from anywhere, because reading cannot overwrite anything.
 *
 *   bun scripts/sync-shared-core.ts --check [--group <name>] [--fleet-root <dir>]
 */
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { argv, cwd, exit } from 'node:process';

import { checkGroup, type Finding, type GroupReport, isFatal } from './lib/shared-core/check.ts';
import { loadManifest } from './lib/shared-core/manifest.ts';

const USAGE = `sync-shared-core — verify the files this fleet shares between peer repositories.

  --check                 Compare every group's targets against its owner. Required today; there
                          is no write path yet.
  --group <name>          Restrict to one manifest group.
  --fleet-root <dir>      Directory holding the peer repositories. Defaults to the parent of this
                          repository.
  --help                  This text.
`;

/**
 * Unknown flags are rejected rather than ignored.
 *
 * sync-license-core.ts, which this generalizes, tests only for the presence of --check. Every other
 * argument — including --help, and including a typo — falls through to the write path and performs
 * a real four-repository write. That is a trap laid for exactly the person trying to find out what
 * the script does, and it is not carried forward.
 */
function parseArgs(args: string[]): {
	check: boolean;
	fleetRoot?: string;
	group?: string;
	help: boolean;
} {
	const parsed: { check: boolean; fleetRoot?: string; group?: string; help: boolean } = {
		check: false,
		help: false,
	};
	for (let i = 0; i < args.length; i += 1) {
		const arg = args[i] as string;
		if (arg === '--check') {
			parsed.check = true;
		} else if (arg === '--help' || arg === '-h') {
			parsed.help = true;
		} else if (arg === '--group' || arg === '--fleet-root') {
			const value = args[i + 1];
			if (value === undefined || value.startsWith('-')) {
				throw new Error(`${arg} needs a value.`);
			}
			if (arg === '--group') parsed.group = value;
			else parsed.fleetRoot = value;
			i += 1;
		} else {
			throw new Error(`Unrecognized argument '${arg}'.\n\n${USAGE}`);
		}
	}
	return parsed;
}

function order(findings: Finding[]): Finding[] {
	// Keys are alphabetical to satisfy the sort rule; the VALUES carry the reporting order, which is
	// severity: what fails the gate, then what needs a decision, then what the write path will fix.
	const rank: Record<Finding['kind'], number> = {
		drift: 0,
		'foreign-hook': 1,
		'local-chain': 4,
		uncovered: 3,
		'unmanaged-dispatch': 5,
		unwired: 2,
	};
	return [...findings].sort((a, b) => rank[a.kind] - rank[b.kind]);
}

function printReport(report: GroupReport): void {
	const findings = order(report.findings);
	const drift = findings.filter(isFatal).length;
	console.log(
		`\n${report.group} (owner: ${report.owner}) — ${report.targets} target(s), ` +
			`${report.matched} file(s) current, ${drift} drifted.`,
	);
	for (const finding of findings) {
		const label = finding.kind === 'drift' ? 'DRIFT' : finding.kind.toUpperCase();
		console.log(`  ${label.padEnd(19)} ${finding.target}: ${finding.detail}`);
	}
	for (const skip of report.skipped) console.log(`  ${'SKIPPED'.padEnd(19)} ${skip}`);
}

async function main(): Promise<void> {
	const parsed = parseArgs(argv.slice(2));
	if (parsed.help) {
		console.log(USAGE);
		return;
	}
	if (!parsed.check) {
		console.log('Nothing to do: --check is the only mode this script implements today.');
		console.log(USAGE);
		return;
	}

	const root = resolve(cwd());
	const scriptsDir = join(root, 'scripts');
	const fleetRoot = parsed.fleetRoot === undefined ? dirname(root) : resolve(parsed.fleetRoot);

	let groups = loadManifest(scriptsDir);
	if (parsed.group !== undefined) {
		const wanted = parsed.group;
		groups = groups.filter((g) => g.name === wanted);
		if (groups.length === 0) throw new Error(`No manifest group named '${wanted}'.`);
	}

	const reports: GroupReport[] = [];
	const unverifiable: string[] = [];

	for (const group of groups) {
		const ownerRoot = join(fleetRoot, group.owner);

		// An owner that is not checked out cannot be a baseline, and comparing against nothing
		// would report every target as drifted. Warn and skip, the same as an absent sibling: CI
		// checks out one repository, and this gate has to stay green there.
		if (!existsSync(ownerRoot)) {
			unverifiable.push(
				`${group.name} (owner ${group.owner} not checked out at ${ownerRoot})`,
			);
			continue;
		}
		reports.push(checkGroup(group, fleetRoot, ownerRoot));
	}

	for (const report of reports) printReport(report);

	const fatal = reports.flatMap((r) => r.findings).filter(isFatal);
	const uncovered = reports.flatMap((r) => r.findings).filter((f) => f.kind === 'uncovered');

	console.log('');
	if (unverifiable.length > 0) {
		console.warn(`NOT VERIFIED: ${unverifiable.join('; ')}.`);
	}
	if (uncovered.length > 0) {
		console.log(
			`${uncovered.length} file(s) absent in targets the write path has not reached yet. ` +
				'Absent is a rollout gap, not drift; it does not fail this check.',
		);
	}
	if (fatal.length > 0) {
		console.error(
			`\nShared core has drifted: ${fatal.length} file(s) differ from their owner.\n` +
				'These repositories carry a stale copy while reporting as covered, which is the ' +
				'failure this gate exists to catch. Resync them from the owning repository.',
		);
		exit(1);
	}
	console.log('Shared core: no drift.');
}

await main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	exit(1);
});
