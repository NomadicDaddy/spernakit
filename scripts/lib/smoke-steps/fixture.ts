/**
 * The fixture harness for `scripts/test-smoke-steps.ts`.
 *
 * The gap this covers was never in the set arithmetic. A unit test of "is this command in that list"
 * would have passed on the day a derived app's frozen runbook started withholding thirteen gates.
 * It was that nothing ever performed the comparison. The assertions therefore grade the real CLI on
 * its exit code and its output, which needs a real template repo with two real tags, a real app that
 * carries a frozen copy of the runbook, and a real `.templateoverrides` that fails to suppress it.
 *
 * Fixtures are built under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing
 * tracked. Callers must invoke `cleanup()` in a `finally`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** The step v9.1.0 adds to qc: the shape of every gate an app silently stops running. */
export const ADDED_QC = 'bun run test:upload-validation';
/** The step v9.1.0 adds to a non-qc mode, so mode coverage is proved rather than assumed. */
export const ADDED_DOCKER = 'bun run verify-compression --mode docker-prod';
/** A step only spernakit runs. The app carries it; its package.json key is withheld on purpose. */
export const TEMPLATE_ONLY_QC = 'bun run check:fleet-manifest';
/** A step the app added for itself. One direction only: this must never be reported. */
export const APP_ONLY_QC = 'bun run check:tenant-routes';

const smokeFile = (input: {
	addedDocker: boolean;
	addedQc: boolean;
	appOnly: boolean;
	templateOnly: boolean;
}): string => {
	const qc = [
		{ command: 'bun run typecheck', description: 'Typecheck' },
		...(input.templateOnly
			? [
					{
						command: TEMPLATE_ONLY_QC,
						description: 'Fleet manifest check',
						templateOnly: true,
					},
				]
			: []),
		...(input.addedQc ? [{ command: ADDED_QC, description: 'Upload validation' }] : []),
		...(input.appOnly ? [{ command: APP_ONLY_QC, description: 'Tenant route check' }] : []),
	];
	const dockerProd = [
		{ command: 'docker compose up -d', description: 'Start the stack' },
		...(input.addedDocker
			? [{ command: ADDED_DOCKER, description: 'Verify compression' }]
			: []),
	];
	return `${JSON.stringify({ modes: { 'docker-prod': { steps: dockerProd }, qc: { steps: qc } } }, null, '\t')}\n`;
};

/** The template runbook at v9.0.0: what the app was seeded from. */
export const TEMPLATE_V9_0_0 = smokeFile({
	addedDocker: false,
	addedQc: false,
	appOnly: false,
	templateOnly: true,
});

/** The template runbook at v9.1.0: two steps the app has never received. */
export const TEMPLATE_V9_1_0 = smokeFile({
	addedDocker: true,
	addedQc: true,
	appOnly: false,
	templateOnly: true,
});

/** The app's frozen copy: v9.0.0's steps plus one of its own. */
export const APP_SMOKE = smokeFile({
	addedDocker: false,
	addedQc: false,
	appOnly: true,
	templateOnly: true,
});

/** The app's runbook after a dance merged both v9.1.0 steps in. */
export const APP_SMOKE_MERGED = smokeFile({
	addedDocker: true,
	addedQc: true,
	appOnly: true,
	templateOnly: true,
});

export const APP_SCRIPTS: Readonly<Record<string, string>> = {
	'check:tenant-routes': 'bun scripts/check-tenant-routes.ts',
	'test:upload-validation': 'bun scripts/test-upload-validation.ts',
	typecheck: 'tsc --noEmit',
	'verify-compression': 'bun scripts/verify-compression.ts',
};

export interface SmokeStepRun {
	exitCode: number;
	output: string;
}

export interface SmokeStepFixture {
	cleanup: () => void;
	/** Run the real `check-smoke-steps` CLI from inside the fixture app. */
	run: (args?: string[], env?: Record<string, string>) => SmokeStepRun;
	/** Write an app-relative file. */
	write: (relPath: string, content: string) => void;
	/** Declare the app's version, script keys, and whether smoke.json is override-suppressed. */
	writeApp: (input: {
		overrides?: string[];
		scripts?: Record<string, string>;
		version: string;
	}) => void;
}

function writeFile(root: string, relPath: string, content: string): void {
	const full = join(root, relPath);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, content, 'utf-8');
}

/**
 * Build a template repo tagged v9.0.0 and v9.1.0, plus an app frozen at v9.0.0's runbook.
 *
 * v9.1.0 adds one qc step and one docker-prod step, so a single run proves both that a missing step
 * is named and that modes other than qc are compared.
 */
export function createSmokeStepFixture(repoRoot: string): SmokeStepFixture {
	const script = join(repoRoot, 'scripts', 'check-smoke-steps.ts');
	const fixtureParent = join(repoRoot, 'tmp');
	mkdirSync(fixtureParent, { recursive: true });
	const fixtureRoot = mkdtempSync(join(fixtureParent, 'smoke-steps-'));
	const templateDir = join(fixtureRoot, 'template');
	const appDir = join(fixtureRoot, 'app');

	const git = (...args: string[]): void => {
		const result = Bun.spawnSync(
			['git', '-C', templateDir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
			{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
		);
		if (result.exitCode !== 0) {
			throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
		}
	};

	mkdirSync(templateDir, { recursive: true });
	git('init', '-b', 'main');
	writeFile(templateDir, 'scripts/smoke.json', TEMPLATE_V9_0_0);
	writeFile(templateDir, 'package.json', '{"name": "spernakit", "version": "9.0.0"}\n');
	git('add', '-A');
	git('commit', '-m', 'v9.0.0');
	git('tag', 'v9.0.0');
	writeFile(templateDir, 'scripts/smoke.json', TEMPLATE_V9_1_0);
	git('add', '-A');
	git('commit', '-m', 'v9.1.0');
	git('tag', 'v9.1.0');

	const write = (relPath: string, content: string): void => writeFile(appDir, relPath, content);
	write('scripts/smoke.json', APP_SMOKE);

	return {
		cleanup: (): void => rmSync(fixtureRoot, { force: true, recursive: true }),
		run: (args = [], env = {}): SmokeStepRun => {
			const result = Bun.spawnSync(['bun', script, '--template', templateDir, ...args], {
				cwd: appDir,
				// The spawned CLI needs the developer toolchain's PATH, and the fixture varies
				// DRIFT_REQUIRED per assertion.
				env: { ...process.env, ...env }, // allow-env-spread-policy
				stderr: 'pipe',
				stdout: 'pipe',
				windowsHide: true,
			});
			return {
				exitCode: result.exitCode,
				output: `${result.stdout.toString()}${result.stderr.toString()}`,
			};
		},
		write,
		writeApp: ({ overrides, scripts, version }): void => {
			write(
				'package.json',
				`${JSON.stringify(
					{
						name: 'fixture-app',
						scripts: scripts ?? APP_SCRIPTS,
						spernakit_version: version,
					},
					null,
					'\t',
				)}\n`,
			);
			if (overrides !== undefined) write('.templateoverrides', `${overrides.join('\n')}\n`);
		},
	};
}
