/**
 * Printing for `check:smoke-steps`.
 *
 * Findings go to stderr one per line in the `- <path>:<line> <message>` form, and the one-line
 * verdict goes to stdout, so a caller can capture the verdict without the detail.
 *
 * The line number cited for a missing step is where the mode's block opens in the APP's own file,
 * which is where the step has to be inserted. A missing step has no line of its own by definition,
 * and pointing at the template's file would name a line in a repository the reader is not editing.
 */

import { type MissingStep, type SmokeStepComparison, type UnwiredStep } from './compare.ts';

const SMOKE = 'scripts/smoke.json';

function lineOf(text: string, needle: string): number {
	const index = text.indexOf(needle);
	if (index === -1) return 1;
	return text.slice(0, index).split('\n').length;
}

/** Where the app's file declares a mode, for a "insert the step here" citation. */
function modeLine(appText: string, mode: string): number {
	return lineOf(appText, `"${mode}":`);
}

function describeMissing(appText: string, step: MissingStep): string {
	const only = step.templateOnly ? ' [spernakit-only step, but the file still carries it]' : '';
	return (
		`- ${SMOKE}:${modeLine(appText, step.mode)} mode "${step.mode}" is missing the template ` +
		`step "${step.command}" (${step.description})${only}`
	);
}

function describeUnwired(appText: string, step: UnwiredStep): string {
	return (
		`- ${SMOKE}:${lineOf(appText, step.command)} mode "${step.mode}" runs "bun run ${step.key}" ` +
		`but package.json declares no "${step.key}" script`
	);
}

export interface SmokeStepReportInput {
	appText: string;
	comparison: SmokeStepComparison;
	version: string;
}

/** Print the report and return the gate's exit code. */
export function printSmokeSteps(input: SmokeStepReportInput): number {
	const { appText, comparison, version } = input;
	const { appExtra, examined, missing, missingModes, modes, unwired } = comparison;

	if (examined === 0) {
		console.error(
			`[FAIL] the template's ${SMOKE} at v${version} declares no steps, so this run compared ` +
				'nothing; a pass here would be a pass over an empty population',
		);
		return 1;
	}

	for (const mode of missingModes) {
		console.error(
			`- ${SMOKE}:1 mode "${mode}" is absent; the template declares it at v${version}`,
		);
	}
	for (const step of missing) console.error(describeMissing(appText, step));
	for (const step of unwired) console.error(describeUnwired(appText, step));

	if (missing.length === 0 && unwired.length === 0) {
		console.log(
			`[OK] check:smoke-steps -- ${examined} template step(s) examined across ${modes} mode(s) ` +
				`against v${version}; none missing, ${appExtra} app-only step(s) ignored.`,
		);
		return 0;
	}

	console.log(
		`[FAIL] check:smoke-steps -- ${missing.length} template step(s) missing and ` +
			`${unwired.length} unwired step(s), of ${examined} examined across ${modes} mode(s) ` +
			`against v${version}. Merge the named steps into ${SMOKE}; ` +
			'`bun run smoke:docs` then regenerates scripts/smoke.md.',
	);
	return 1;
}
