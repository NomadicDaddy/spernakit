/**
 * The two gate entrypoints and their canonical mapping.
 *
 * The template runs its gate through the smokestack runner (`scripts/smokestack.ts`, wired by
 * its smokestack.lock). A derived app is not on the smokestack roster: it keeps the shipped
 * gate (`scripts/smoke.ts --mode qc`), and the runner files are init-excluded (v3.47.6). These
 * two script tasks are therefore a legitimate template/app difference with exactly one
 * sanctioned form on each side - setup rewrites them at scaffold time
 * (lib/setup/file-updates.ts), and the drift checker normalizes them for comparison
 * (lib/template/branding-normalizers.ts). Both read this one table so the forms cannot drift
 * apart. Anything else found in these two tasks is real drift and stays compared or pruned.
 */

export interface GateScriptRewrite {
	app: string;
	template: RegExp;
}

export const GATE_SCRIPT_REWRITES: Record<string, GateScriptRewrite> = {
	'smoke:qc': {
		app: 'bun scripts/smoke.ts --mode qc',
		template: /^bun scripts\/smokestack\.ts$/,
	},
	'smoke:qc:fast': {
		app: 'bun scripts/smoke.ts --mode qc --fast',
		template: /^bun scripts\/smokestack\.ts --fast$/,
	},
};
