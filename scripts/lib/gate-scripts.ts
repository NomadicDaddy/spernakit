/**
 * The two gate entrypoints and their canonical mapping.
 *
 * The template runs its gate through the directly delivered smokestack runner. A new app does
 * not receive that runner from init: setup gives it the local smoke.ts gate until smokestack is
 * delivered to the app itself. Setup rewrites the two template commands before pruning missing
 * script targets; the drift checker recognizes both sanctioned forms during that bootstrap.
 * A delivered app switches its package scripts to the runner as part of its own delivery.
 */

export interface GateScriptRewrite {
	app: string;
	template: RegExp;
}

export const GATE_SCRIPT_REWRITES: Record<string, GateScriptRewrite> = {
	'smoke:qc': {
		app: 'bun scripts/smoke.ts --mode qc',
		template: /^bun scripts\/smokestack\/smokestack\.ts$/,
	},
	'smoke:qc:fast': {
		app: 'bun scripts/smoke.ts --mode qc --fast',
		template: /^bun scripts\/smokestack\/smokestack\.ts --fast$/,
	},
};

/**
 * Apply the sanctioned rewrites to a scripts block, in place. Setup calls this on a scaffolded
 * app's package.json BEFORE its missing-file pruning, so the gate tasks point at files the new
 * app actually holds rather than being deleted for naming the separately delivered runner
 * (lib/setup/file-updates.ts; the order is what keeps the gate task alive - Morticia #16566 Low).
 */
export function applyGateScriptRewrites(scripts: Record<string, string>): void {
	for (const [task, rewrite] of Object.entries(GATE_SCRIPT_REWRITES)) {
		if (typeof scripts[task] === 'string' && rewrite.template.test(scripts[task])) {
			scripts[task] = rewrite.app;
		}
	}
}
