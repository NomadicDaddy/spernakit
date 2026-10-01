#!/usr/bin/env bun
/**
 * Require every `test:*` script in `package.json` to be run by a step in `scripts/smoke.json`.
 *
 * Enforces: no regression test exists as a package script that nothing runs. No assertion ID; this
 * is a wiring invariant rather than a catalog rule.
 *
 * A test script that passes when someone runs it by hand reads as a gate and is not one. Deeper had
 * six, five of them written the day before and each reported as passing, which was true; this
 * repository had `test:fresh-release`. Nothing ran any of them, so none could catch a regression
 * (Carl, 2026-09-30, whose Deeper check this is).
 *
 * A script that genuinely cannot run in any smoke mode is excused in `scripts/smoke.json` under
 * `excusedTests`, by name and with a reason. The list lives there rather than here because an
 * application with its own test scripts already keeps its own `smoke.json` (a `KEEP` in
 * `.templateoverrides`) to register their steps, so an excuse costs it no further override. A list
 * in this file would force a second one. Three rules keep the list from becoming the hole:
 *
 * - An excuse needs a reason. A bare name cannot be told apart from a gate somebody gave up on.
 * - An excuse for a script that no longer exists fails, as does one for a script that is wired.
 *   Otherwise every rename widens the list while the check still prints OK.
 * - A step runs a script only when it names it exactly. `test:server-services` in the runbook does
 *   not wire `test:server`.
 *
 * A script also counts as run when a wired script's command chains its whole command with `&&`.
 */

import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { cwd, exit } from 'node:process';
import { parseArgs } from 'node:util';

export interface GatesWiredResult {
	code: number;
	examined: number;
	findings: string[];
}

function readObject(path: string): Record<string, unknown> {
	const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
	if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
		throw new Error(`${path} must contain one JSON object.`);
	}
	return parsed as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Every script a smoke step runs with `bun run <name>`, across all modes. */
function wiredScripts(smoke: Record<string, unknown>): Set<string> {
	const wired = new Set<string>();
	const modes = isRecord(smoke.modes) ? Object.values(smoke.modes) : [];
	for (const mode of modes) {
		const steps = isRecord(mode) && Array.isArray(mode.steps) ? mode.steps : [];
		for (const step of steps) {
			if (!isRecord(step) || typeof step.command !== 'string') continue;
			const tokens = step.command.split(/\s+/);
			for (let i = 0; i + 2 < tokens.length + 1; i++) {
				const name = tokens[i + 2];
				if (tokens[i] === 'bun' && tokens[i + 1] === 'run' && name !== undefined) {
					wired.add(name);
				}
			}
		}
	}
	return wired;
}

export function runGatesWiredCheck(root: string): GatesWiredResult {
	const scripts = readObject(join(root, 'package.json')).scripts;
	const commands = isRecord(scripts) ? scripts : {};
	const gates = Object.keys(commands).filter((name) => name.startsWith('test:'));
	const smoke = readObject(join(root, 'scripts', 'smoke.json'));
	const wired = wiredScripts(smoke);
	// A wired script that chains another script's whole command runs that script too:
	// `test:template-drift` is `<drift test> && <deletions test>`, so `test:template-deletions` runs.
	const chained = new Set<string>();
	for (const name of wired) {
		const command = commands[name];
		if (typeof command !== 'string') continue;
		for (const segment of command.split('&&')) chained.add(segment.trim());
	}
	for (const gate of gates) {
		const command = commands[gate];
		if (typeof command === 'string' && chained.has(command.trim())) wired.add(gate);
	}
	const findings: string[] = [];
	// A manifest with no test scripts at all is a wrong directory, not a clean result.
	if (gates.length === 0) findings.push('package.json defines no test:* script to examine.');

	const excused = new Set<string>();
	const entries: unknown[] = Array.isArray(smoke.excusedTests) ? smoke.excusedTests : [];
	if (smoke.excusedTests !== undefined && !Array.isArray(smoke.excusedTests)) {
		findings.push('excusedTests in scripts/smoke.json must be an array.');
	}
	for (const entry of entries) {
		const script = isRecord(entry) ? entry.script : undefined;
		const reason = isRecord(entry) ? entry.reason : undefined;
		if (typeof script !== 'string' || script === '') {
			findings.push('An excusedTests entry has no "script" name.');
			continue;
		}
		excused.add(script);
		if (typeof reason !== 'string' || reason.trim() === '') {
			findings.push(
				`${script} is excused without a reason. Say why no smoke mode can run it.`,
			);
		}
		if (!gates.includes(script)) {
			findings.push(`${script} is excused but is not a script. Remove the excuse.`);
		} else if (wired.has(script)) {
			findings.push(`${script} is excused but a smoke step runs it. Remove the excuse.`);
		}
	}

	for (const gate of gates) {
		if (wired.has(gate) || excused.has(gate)) continue;
		findings.push(
			`${gate} is run by no step in scripts/smoke.json. Add a step, or excuse it there under excusedTests with a reason.`,
		);
	}
	return { code: findings.length === 0 ? 0 : 1, examined: gates.length, findings };
}

if (import.meta.main) {
	const { values } = parseArgs({ options: { root: { type: 'string' } }, strict: true });
	const result = runGatesWiredCheck(resolve(values.root ?? cwd()));
	if (result.code === 0) {
		console.log(
			`[OK] check:gates-wired -- all ${String(result.examined)} test:* script(s) are run by a smoke step or excused with a reason.`,
		);
	} else {
		for (const finding of result.findings)
			console.error(`[FAIL] check:gates-wired: ${finding}`);
	}
	exit(result.code);
}
