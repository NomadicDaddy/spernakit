#!/usr/bin/env bun
/**
 * Regression test for the sanctioned gate-command mapping (v3.47.6).
 *
 * The template runs its gate through the smokestack runner; a derived app keeps the shipped
 * smoke.ts gate because the runner files are init-excluded. The two script tasks differ by
 * exactly that: scripts/lib/gate-scripts.ts is the one table both sides read - setup rewrites
 * the runner forms into a new app before its missing-file pruning, and the drift normalizer maps
 * both forms to a common token. This pins all three properties so the table cannot drift: the
 * rewrite fires only on the exact template forms, the app forms pass through, and the drift
 * comparison sees both sides as equal while a rogue command stays different (Roger 88317845).
 */
import { exit } from 'node:process';

import { GATE_SCRIPT_REWRITES } from './lib/gate-scripts.ts';
import { normalizePackageJson } from './lib/template/branding-normalizers.ts';

const failures: string[] = [];

const templateScripts: Record<string, string> = {
	'smoke:qc': 'bun scripts/smokestack.ts',
	'smoke:qc:fast': 'bun scripts/smokestack.ts --fast',
};
const appScripts: Record<string, string> = {
	'smoke:qc': 'bun scripts/smoke.ts --mode qc',
	'smoke:qc:fast': 'bun scripts/smoke.ts --mode qc --fast',
};

for (const [task, rewrite] of Object.entries(GATE_SCRIPT_REWRITES)) {
	const templateForm = templateScripts[task];
	if (templateForm === undefined) {
		failures.push(`${task} has no template form in this test`);
		continue;
	}
	if (!rewrite.template.test(templateForm)) {
		failures.push(`${task} template form ${templateForm} no longer matches the table`);
	}
	if (rewrite.app !== appScripts[task]) {
		failures.push(`${task} app form drifted: table says ${rewrite.app}`);
	}
	// The app form must pass through the template pattern unchanged (idempotence).
	if (rewrite.template.test(rewrite.app)) {
		failures.push(`${task} app form matches the template pattern; the rewrite is not minimal`);
	}
	// A rogue command must not be rewritten or normalized away.
	const rogue = 'bun scripts/not-a-gate.ts';
	if (rewrite.template.test(rogue)) {
		failures.push(`${task} rewrites a rogue command`);
	}
}

const packageFor = (name: string, scripts: Record<string, string>) =>
	JSON.stringify({ name, scripts: { ...scripts, build: 'bun run build' } });
const normalizedTemplate = normalizePackageJson(
	packageFor('spernakit', templateScripts),
	{
		backendPort: '4100',
		description: 'template',
		frontendPort: '4200',
		name: 'Template',
		slug: 'spernakit',
	},
	true,
	'package.json',
);
const normalizedApp = normalizePackageJson(
	packageFor('v3476accept', appScripts),
	{
		backendPort: '4300',
		description: 'app',
		frontendPort: '4400',
		name: 'App',
		slug: 'v3476accept',
	},
	false,
	'package.json',
);
if (normalizedTemplate !== normalizedApp) {
	failures.push('template and app package.json differ after normalization');
}
const normalizedRogue = normalizePackageJson(
	packageFor('v3476accept', { 'smoke:qc': 'bun scripts/not-a-gate.ts' }),
	{
		backendPort: '4300',
		description: 'app',
		frontendPort: '4400',
		name: 'App',
		slug: 'v3476accept',
	},
	false,
	'package.json',
);
if (normalizedRogue === normalizedApp) {
	failures.push('a rogue smoke:qc command normalizes the same as the sanctioned app form');
}

if (failures.length > 0) {
	console.error('[FAIL] gate script mapping:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	`[OK] gate script mapping: ${Object.keys(GATE_SCRIPT_REWRITES).length} task(s), exact forms only, drift-equal.`,
);
