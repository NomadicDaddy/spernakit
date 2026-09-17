/**
 * The non-vacuity proof for `check:smoke-steps`, performed against a real derived app.
 *
 * A fixture proves the comparison is implemented. It cannot prove the comparison is the one the
 * fleet needs: the fixture's runbook is two modes and four steps, written by the same hand as the
 * gate, and it would pass just as happily if the real files turned out to have a shape nobody
 * anticipated. So the proof runs against a sibling app's actual `scripts/smoke.json` and the actual
 * template tag that app declares: one template step is removed from a COPY, the gate must name it,
 * and restoring it must return the gate to green.
 *
 * The copy is the whole point. Nothing here writes to a sibling repository.
 *
 * No sibling is a `[SKIP]`, not a failure. A fresh clone and CI have no fleet beside them.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { parseSmokeFile, type SmokeStep } from './compare.ts';

export interface RealAppRun {
	exitCode: number;
	output: string;
}

export interface RealAppProof {
	app: string;
	/** The gate's verdict once the removed step is put back. */
	restored: RealAppRun;
	/** The gate's verdict with one template step removed. */
	shortened: RealAppRun;
	/** The command removed from the copy. */
	step: string;
	version: string;
}

const SMOKE = 'scripts/smoke.json';

function runGate(repoRoot: string, appDir: string): RealAppRun {
	const result = Bun.spawnSync(
		['bun', join(repoRoot, 'scripts', 'check-smoke-steps.ts'), '--template', repoRoot],
		{
			cwd: appDir,
			// The spawned CLI needs the developer toolchain's PATH.
			env: { ...process.env }, // allow-env-spread-policy
			stderr: 'pipe',
			stdout: 'pipe',
			windowsHide: true,
		},
	);
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function templateSmokeAt(repoRoot: string, version: string): null | string {
	const result = Bun.spawnSync(['git', '-C', repoRoot, 'show', `v${version}:${SMOKE}`], {
		stderr: 'pipe',
		stdout: 'pipe',
		windowsHide: true,
	});
	if (result.exitCode !== 0) return null;
	return result.stdout.toString();
}

/** Sibling directories that declare a `spernakit_version` and carry a runbook. */
function findSiblingApps(repoRoot: string): string[] {
	const parent = dirname(repoRoot);
	const self = basename(repoRoot);
	const apps: string[] = [];
	for (const entry of readdirSync(parent, { withFileTypes: true })) {
		if (!entry.isDirectory() || entry.name === self) continue;
		const dir = join(parent, entry.name);
		if (!existsSync(join(dir, SMOKE))) continue;
		try {
			const pkg: unknown = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
			if (typeof (pkg as { spernakit_version?: unknown }).spernakit_version === 'string') {
				apps.push(dir);
			}
		} catch {
			continue;
		}
	}
	return apps.sort((a, b) => a.localeCompare(b));
}

/** The first non-`templateOnly` template step the app's copy also carries. */
function removableStep(app: string, template: string): null | string {
	const appCommands = new Set<string>();
	for (const block of Object.values(parseSmokeFile(app, SMOKE).modes)) {
		for (const step of block.steps) appCommands.add(step.command);
	}
	for (const block of Object.values(parseSmokeFile(template, SMOKE).modes)) {
		const candidate = (block.steps as SmokeStep[]).find(
			(step) => step.templateOnly !== true && appCommands.has(step.command),
		);
		if (candidate !== undefined) return candidate.command;
	}
	return null;
}

function stripStep(smokeText: string, command: string): string {
	const file = parseSmokeFile(smokeText, SMOKE);
	for (const block of Object.values(file.modes)) {
		const index = block.steps.findIndex((step) => step.command === command);
		if (index !== -1) {
			block.steps.splice(index, 1);
			return `${JSON.stringify(file, null, '\t')}\n`;
		}
	}
	throw new Error(`${command} is not in the copy, so nothing was removed`);
}

/**
 * Copy one sibling app's runbook and manifest into a scratch directory, remove a template step, and
 * grade the real CLI on both states. Returns a reason string when no usable sibling exists.
 */
export function proveAgainstRealApp(repoRoot: string): { reason: string } | RealAppProof {
	const siblings = findSiblingApps(repoRoot);
	if (siblings.length === 0)
		return { reason: 'no sibling derived app is checked out beside this one' };

	const fixtureParent = join(repoRoot, 'tmp');
	mkdirSync(fixtureParent, { recursive: true });

	for (const dir of siblings) {
		const pkgText = readFileSync(join(dir, 'package.json'), 'utf8');
		const version = (JSON.parse(pkgText) as { spernakit_version: string }).spernakit_version;
		const templateText = templateSmokeAt(repoRoot, version);
		if (templateText === null) continue;
		const appText = readFileSync(join(dir, SMOKE), 'utf8');
		const step = removableStep(appText, templateText);
		if (step === null) continue;

		const scratch = mkdtempSync(join(fixtureParent, 'smoke-steps-real-'));
		try {
			mkdirSync(join(scratch, 'scripts'), { recursive: true });
			writeFileSync(join(scratch, 'package.json'), pkgText, 'utf-8');
			writeFileSync(join(scratch, SMOKE), appText, 'utf-8');

			// The baseline must be green before the removal means anything. An app mid-upgrade is not
			// a usable subject, so try the next sibling rather than reporting its shortfall as ours.
			if (runGate(repoRoot, scratch).exitCode !== 0) continue;

			writeFileSync(join(scratch, SMOKE), stripStep(appText, step), 'utf-8');
			const shortened = runGate(repoRoot, scratch);
			writeFileSync(join(scratch, SMOKE), appText, 'utf-8');
			const restored = runGate(repoRoot, scratch);
			return { app: basename(dir), restored, shortened, step, version };
		} finally {
			rmSync(scratch, { force: true, recursive: true });
		}
	}

	return { reason: 'no sibling app both declares a readable template tag and starts from green' };
}
