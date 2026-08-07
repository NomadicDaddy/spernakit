/**
 * The fixture harness for `scripts/test-template-deletions.ts`.
 *
 * The blind spot this covers was never in the set arithmetic — it was in the fact that nothing ever
 * performed it, so a unit test of `detectRetainedDeletions` would have passed on the day the bug
 * shipped. The assertions therefore grade the real CLI on its exit code and output, which means they
 * need a real template repo with two real tags and a real app directory pointed at it. That setup
 * lives here so the test file holds assertions rather than scaffolding.
 *
 * Fixtures are built under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing
 * tracked. Callers must invoke `cleanup()` in a `finally`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const REMOVED_FILE = 'backend/src/routes/auth/mfa-rate-limit.ts';
export const KEPT_FILE = 'backend/src/utils/keep.ts';
export const MANIFEST = 'scripts/template-manifest.json';
/** Scaffold-mapped: `scaffolding/.prettierignore` in the template, `.prettierignore` in the app. */
export const REMOVED_SCAFFOLD = '.prettierignore';
export const APP_ONLY_FILE = 'frontend/src/pages/AppOnly.tsx';

/** Template contents at v9.0.0, keyed by their path IN THE TEMPLATE. */
export const TEMPLATE_CONTENTS: Readonly<Record<string, string>> = {
	[KEPT_FILE]: 'export const keep = true;\n',
	[MANIFEST]: '{"branded": [], "infrastructure": []}\n',
	[REMOVED_FILE]: 'export const mfaRateLimit = 5;\n',
	'scaffolding/.gitignore': 'node_modules/\n',
	'scaffolding/.prettierignore': 'dist/\n',
};

export interface DriftRun {
	exitCode: number;
	output: string;
}

export interface DeletionFixture {
	cleanup: () => void;
	/** Delete an app-relative path. */
	remove: (relPath: string) => void;
	/** Restore an app path to the template's v9.0.0 bytes. */
	restore: (appPath: string, templatePath?: string) => void;
	/** Run the real drift CLI from inside the fixture app. */
	runDrift: (args: string[], env?: Record<string, string>) => DriftRun;
	/** Write an app-relative path. */
	write: (relPath: string, content: string) => void;
}

function writeFile(root: string, relPath: string, content: string): void {
	const full = join(root, relPath);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, content, 'utf-8');
}

/**
 * Build a template repo tagged v9.0.0 and v9.1.0, plus an app scaffolded from v9.0.0.
 *
 * v9.1.0 drops one ordinary file and one scaffold-mapped file. The app is byte-identical to v9.0.0,
 * so ordinary drift is zero and any non-zero exit is attributable to the deletion check alone; it
 * also carries two app-authored files at paths no template tag has ever shipped.
 */
export function createDeletionFixture(repoRoot: string): DeletionFixture {
	const driftScript = join(repoRoot, 'scripts', 'check-template-drift.ts');
	const fixtureParent = join(repoRoot, 'tmp');
	mkdirSync(fixtureParent, { recursive: true });
	const fixtureRoot = mkdtempSync(join(fixtureParent, 'template-deletions-'));
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
	for (const [relPath, content] of Object.entries(TEMPLATE_CONTENTS)) {
		writeFile(templateDir, relPath, content);
	}
	git('add', '-A');
	git('commit', '-m', 'v9.0.0');
	git('tag', 'v9.0.0');

	rmSync(join(templateDir, REMOVED_FILE));
	rmSync(join(templateDir, 'scaffolding/.prettierignore'));
	git('add', '-A');
	git('commit', '-m', 'v9.1.0');
	git('tag', 'v9.1.0');

	const write = (relPath: string, content: string): void => writeFile(appDir, relPath, content);
	const restore = (appPath: string, templatePath = appPath): void =>
		write(appPath, TEMPLATE_CONTENTS[templatePath] ?? '');

	restore(KEPT_FILE);
	restore(MANIFEST);
	restore(REMOVED_FILE);
	restore('.gitignore', 'scaffolding/.gitignore');
	restore(REMOVED_SCAFFOLD, 'scaffolding/.prettierignore');
	write('package.json', '{"name": "fixture-app", "spernakit_version": "9.0.0"}\n');
	write(APP_ONLY_FILE, 'export const AppOnly = () => null;\n');
	// Branding resolution loads (and would otherwise auto-create) config/{slug}.json. Supplying it
	// keeps the fixture from generating fresh keys on every run. config/ is drift-excluded, so this
	// file never enters either comparison.
	write(
		'config/fixture-app.json',
		JSON.stringify({
			app: { description: 'Fixture', name: 'Fixture App', slug: 'fixture-app' },
			server: { backendPort: 3331, frontendPort: 3330 },
		}),
	);

	return {
		cleanup: (): void => rmSync(fixtureRoot, { force: true, recursive: true }),
		remove: (relPath): void => rmSync(join(appDir, relPath)),
		restore,
		/**
		 * APP_SLUG is supplied because branding resolution exits the process outright when it
		 * cannot name the app. No fixture file is branded, so the value never affects a
		 * comparison — it only gets the checker past that precondition.
		 */
		runDrift: (args, env = {}): DriftRun => {
			const result = Bun.spawnSync(['bun', driftScript, '--template', templateDir, ...args], {
				cwd: appDir,
				// Runs the real drift CLI against a fixture app; it needs the developer toolchain
				// environment to reach `git`, and only APP_SLUG is fixture-specific.
				env: { ...process.env, APP_SLUG: 'fixture-app', ...env }, // allow-env-spread-policy
				stderr: 'pipe',
				stdout: 'pipe',
			});
			return {
				exitCode: result.exitCode,
				output: `${result.stdout.toString()}${result.stderr.toString()}`,
			};
		},
		write,
	};
}
