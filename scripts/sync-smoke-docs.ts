#!/usr/bin/env bun
/**
 * Keeps the step lists in scripts/smoke.md in sync with scripts/smoke.json.
 *
 *   bun scripts/sync-smoke-docs.ts           # rewrite the lists
 *   bun scripts/sync-smoke-docs.ts --check   # fail if they drifted
 *
 * smoke.md is the operator runbook for each mode. Generating the step lists prevents them from
 * diverging from smoke.json; `check-docs` validates links but not command sequences.
 *
 * Only the numbered lists under each "Steps (in order):" heading are generated; the prose around
 * them is left alone.
 */

import { join } from 'node:path';
import { cwd, exit } from 'node:process';

interface SmokeStep {
	command: string;
	description: string;
}

interface SmokeConfig {
	modes: Record<string, { steps: SmokeStep[] }>;
}

/** smoke.md section heading -> smoke.json mode key. */
const SECTION_TO_MODE: Record<string, string> = {
	Dev: 'dev',
	'Docker Local': 'docker-local',
	'Docker Prod': 'docker-prod',
	Preview: 'preview',
	'QC (typecheck, lint, format, build)': 'qc',
	Reset: 'reset',
	Screenshots: 'screenshots',
};

function renderSteps(steps: SmokeStep[]): string {
	return steps
		.map((step, index) => {
			const description = step.description.trim().replace(/\.$/, '');
			return `${index + 1}. \`${step.command}\`\n    - ${description}.`;
		})
		.join('\n');
}

function syncDocument(markdown: string, config: SmokeConfig): string {
	const lines = markdown.split('\n');
	const output: string[] = [];
	let currentMode: string | undefined;

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index] ?? '';

		const heading = /^### \d+\.\s+(.*)$/.exec(line);
		if (heading) currentMode = SECTION_TO_MODE[heading[1]?.trim() ?? ''];

		output.push(line);
		if (line.trim() !== 'Steps (in order):' || currentMode === undefined) continue;

		const steps = config.modes[currentMode]?.steps;
		if (!steps) continue;

		// Consume the existing list (through to the next heading) and emit a generated one.
		let cursor = index + 1;
		while (cursor < lines.length && !/^#{2,3}\s/.test(lines[cursor] ?? '')) cursor += 1;

		output.push('', renderSteps(steps), '');
		index = cursor - 1;
	}

	return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function main(): Promise<void> {
	const root = cwd();
	const check = Bun.argv.includes('--check');

	const config = (await Bun.file(join(root, 'scripts/smoke.json')).json()) as SmokeConfig;
	const markdown = await Bun.file(join(root, 'scripts/smoke.md')).text();
	const synced = syncDocument(markdown, config);

	if (!check) {
		await Bun.write(join(root, 'scripts/smoke.md'), synced);
		console.log('Wrote scripts/smoke.md');
		return;
	}

	if (synced !== markdown) {
		console.error('scripts/smoke.md is out of sync with scripts/smoke.json.');
		console.error(
			'The runbook describes steps the runner does not run, or omits ones it does.'
		);
		console.error('Run `bun run smoke:docs` and commit the result.');
		exit(1);
	}

	console.log('[OK] scripts/smoke.md matches scripts/smoke.json.');
}

if (import.meta.main) {
	await main();
}
