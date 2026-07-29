/**
 * The fixture harness for `scripts/test-lost-lines.ts`.
 *
 * The audit's verdict is a function of three histories at once — the template's, the app's, and the
 * audited commit's own diff — so a unit test of the line arithmetic proves very little. The
 * assertions therefore grade the shipped CLI on its exit code and output against real git repos: a
 * template with two tagged revisions, and an app with a root `init`, an earlier template sync, an app
 * feature commit, and two alternative successors from the same parent — one that loses app work and
 * one that does not.
 *
 * Fixtures are built under `<repo>/tmp/`, which is gitignored, so a crashed run leaves nothing
 * tracked. Callers must invoke `cleanup()` in a `finally`.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export const NAV = 'backend/src/utils/nav.ts';
export const ROUTES = 'frontend/src/routes.tsx';
export const UNTOUCHED = 'backend/src/utils/untouched.ts';
export const SYNCED = 'backend/src/utils/synced.ts';
export const APP_ONLY = 'frontend/src/pages/AppOnly.tsx';
/** Scaffold-mapped: `scaffolding/.prettierignore` in the template, `.prettierignore` in the app. */
export const SCAFFOLD = '.prettierignore';

/** App work the upgrade drops from a template-managed file. The finding this audit exists for. */
export const LOST_NAV_LINE = "\t{ label: 'Reports', href: '/reports' },";
/** App work dropped from a scaffold-mapped file — only found if `toTemplatePath` is applied. */
export const LOST_SCAFFOLD_LINE = 'coverage/';
/** Dropped by the same commit, but the template shipped it once: stale content, not app work. */
export const TEMPLATE_OWNED_LINE = 'export const legacyNavFlag = true;';
/** App work that SURVIVES the upgrade and only gains a trailing comma from the reflow. */
export const REFLOWED_APP_LINE = "\t{ path: '/reports', element: 'Reports' }";
/** In no surviving template revision, but the app never touched the file after `init`. */
export const INIT_ONLY_LINE = "export const ancientHelper = 'seeded from a vanished tag';";
/** In no surviving template revision, and written into the app by an EARLIER template sync. */
export const SYNC_ONLY_LINE = "export const interimHelper = 'from an untagged template fix';";
/** Lost from a path no template revision has ever had: an app edit riding along, not upgrade loss. */
export const APP_ONLY_LINE = "export const appOnlyHelper = 'app work';";

export const FEATURE_SUBJECT = 'feat(nav): add the reports entry';
export const SYNC_SUBJECT = 'chore(template): sync untagged 9.0.1 fixes';

const lines = (...parts: string[]): string => `${parts.join('\n')}\n`;

const NAV_V1 = lines(
	'export const navEntries = [',
	"\t{ label: 'Dashboard' },",
	'];',
	'',
	'export function visibleNav(entries: string[]): string[] {',
	'\treturn entries;',
	'}',
	'',
	TEMPLATE_OWNED_LINE,
);

const NAV_V2 = lines(
	'export const navEntries = [',
	"\t{ label: 'Dashboard' },",
	'];',
	'',
	'export function visibleNav(entries: string[], includeHidden: boolean): string[] {',
	'\treturn includeHidden ? entries : entries;',
	'}',
);

/** The app's own entry, added by FEATURE_SUBJECT, sitting in the template's array. */
const NAV_APP = NAV_V1.replace(
	"\t{ label: 'Dashboard' },\n",
	`\t{ label: 'Dashboard' },\n${LOST_NAV_LINE}\n`,
);

/** What the upgrade SHOULD have produced: the template's v2 plus the app's entry. */
const NAV_REPAIRED = NAV_V2.replace(
	"\t{ label: 'Dashboard' },\n",
	`\t{ label: 'Dashboard' },\n${LOST_NAV_LINE}\n`,
);

const ROUTES_V1 = lines('export const routes = [', "\t{ path: '/', element: 'Home' }", '];');
const ROUTES_V2 = lines('export const routes = [', "\t{ path: '/', element: 'Home' },", '];');
const ROUTES_APP = lines(
	'export const routes = [',
	"\t{ path: '/', element: 'Home' },",
	REFLOWED_APP_LINE,
	'];',
);
/** The same app route, reflowed by the v3.31.0 `trailingComma: all` switch. Not a removal. */
const ROUTES_UPGRADED = lines(
	'export const routes = [',
	"\t{ path: '/', element: 'Home' },",
	`${REFLOWED_APP_LINE},`,
	'];',
);

const TEMPLATE_V1: Readonly<Record<string, string>> = {
	[NAV]: NAV_V1,
	[ROUTES]: ROUTES_V1,
	'scaffolding/.prettierignore': lines('dist/'),
	[SYNCED]: lines('export const synced = 1;'),
	[UNTOUCHED]: lines('export const untouched = 1;'),
};

const TEMPLATE_V2: Readonly<Record<string, string>> = {
	[NAV]: NAV_V2,
	[ROUTES]: ROUTES_V2,
	'scaffolding/.prettierignore': lines('dist/', 'build/'),
	[SYNCED]: lines('export const synced = 2;'),
	[UNTOUCHED]: lines('export const untouched = 2;'),
};

/**
 * The app at `init`. `untouched.ts` deliberately carries a line no template revision has: apps
 * seeded before v3.28.2 are full of them, because those tags were squashed away. Only the absence of
 * a later commit on that path keeps it out of the report.
 */
const APP_INIT: Readonly<Record<string, string>> = {
	[APP_ONLY]: lines('export const AppOnly = () => null;'),
	[NAV]: NAV_V1,
	'package.json': '{"name": "fixture-app", "spernakit_version": "9.0.0"}\n',
	[ROUTES]: ROUTES_V1,
	[SCAFFOLD]: lines('dist/'),
	[SYNCED]: lines('export const synced = 1;'),
	[UNTOUCHED]: lines('export const untouched = 1;', INIT_ONLY_LINE),
};

/**
 * An earlier template sync, between `init` and the app's own work. It writes a line into `synced.ts`
 * that no TAGGED template revision carries — the untagged-fix case that made the pre-3.28.2 squash
 * lossy. The upgrade then removes it, and only the commit's subject says it was never app work.
 */
const APP_SYNC: Readonly<Record<string, string>> = {
	[SYNCED]: lines('export const synced = 1;', SYNC_ONLY_LINE),
};

const APP_FEATURE: Readonly<Record<string, string>> = {
	[APP_ONLY]: lines('export const AppOnly = () => null;', APP_ONLY_LINE),
	[NAV]: NAV_APP,
	[ROUTES]: ROUTES_APP,
	[SCAFFOLD]: lines('dist/', LOST_SCAFFOLD_LINE),
};

/** The upgrade as it went wrong: template bytes copied straight over the app's additions. */
const APP_UPGRADE: Readonly<Record<string, string>> = {
	[APP_ONLY]: lines('export const AppOnly = () => null;'),
	[NAV]: NAV_V2,
	[ROUTES]: ROUTES_UPGRADED,
	[SCAFFOLD]: lines('dist/', 'build/'),
	[SYNCED]: lines('export const synced = 2;'),
	[UNTOUCHED]: lines('export const untouched = 2;'),
};

/** The same upgrade done right: identical parent, identical template delta, app work preserved. */
const APP_REPAIRED: Readonly<Record<string, string>> = {
	...APP_UPGRADE,
	[APP_ONLY]: lines('export const AppOnly = () => null;', APP_ONLY_LINE),
	[NAV]: NAV_REPAIRED,
	[SCAFFOLD]: lines('dist/', 'build/', LOST_SCAFFOLD_LINE),
};

export interface AuditRun {
	exitCode: number;
	output: string;
}

export interface LostLinesFixture {
	appDir: string;
	cleanup: () => void;
	featureRev: string;
	/** The correct upgrade from the same parent — the control for every failing assertion. */
	repairedRev: string;
	/** Run the real audit CLI against the fixture app. */
	run: (args: string[]) => AuditRun;
	/** Run the real audit CLI with no arguments supplied for you — for argument-handling checks. */
	runRaw: (args: string[]) => AuditRun;
	templateDir: string;
	/** The upgrade commit that lost app work; also the app's HEAD. */
	upgradeRev: string;
}

function writeFile(root: string, relPath: string, content: string): void {
	const full = join(root, relPath);
	mkdirSync(dirname(full), { recursive: true });
	writeFileSync(full, content, 'utf-8');
}

function writeAll(root: string, files: Readonly<Record<string, string>>): void {
	for (const [relPath, content] of Object.entries(files)) writeFile(root, relPath, content);
}

function gitRunner(dir: string): (...args: string[]) => string {
	return (...args: string[]): string => {
		const result = Bun.spawnSync(
			['git', '-C', dir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
			{ stderr: 'pipe', stdout: 'pipe' },
		);
		if (result.exitCode !== 0) {
			throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
		}
		return result.stdout.toString().trim();
	};
}

/**
 * Build a two-revision template repo and an app with five commits: `init`, an earlier template sync,
 * one app feature commit, and two alternative children of that feature commit — the upgrade that lost
 * app work (on `main`, so it is HEAD) and the repaired upgrade that did not.
 */
export function createLostLinesFixture(repoRoot: string): LostLinesFixture {
	const auditScript = join(repoRoot, 'scripts', 'audit-lost-lines.ts');
	const fixtureParent = join(repoRoot, 'tmp');
	mkdirSync(fixtureParent, { recursive: true });
	const fixtureRoot = mkdtempSync(join(fixtureParent, 'lost-lines-'));
	const templateDir = join(fixtureRoot, 'template');
	const appDir = join(fixtureRoot, 'app');

	const templateGit = gitRunner(templateDir);
	mkdirSync(templateDir, { recursive: true });
	templateGit('init', '-b', 'main');
	writeAll(templateDir, TEMPLATE_V1);
	templateGit('add', '-A');
	templateGit('commit', '-m', 'v9.0.0');
	templateGit('tag', 'v9.0.0');
	writeAll(templateDir, TEMPLATE_V2);
	templateGit('add', '-A');
	templateGit('commit', '-m', 'v9.1.0');
	templateGit('tag', 'v9.1.0');

	const appGit = gitRunner(appDir);
	mkdirSync(appDir, { recursive: true });
	appGit('init', '-b', 'main');
	writeAll(appDir, APP_INIT);
	appGit('add', '-A');
	appGit('commit', '-m', 'init');

	writeAll(appDir, APP_SYNC);
	appGit('add', '-A');
	appGit('commit', '-m', SYNC_SUBJECT);

	writeAll(appDir, APP_FEATURE);
	appGit('add', '-A');
	appGit('commit', '-m', FEATURE_SUBJECT);
	const featureRev = appGit('rev-parse', 'HEAD');

	writeAll(appDir, APP_UPGRADE);
	appGit('add', '-A');
	appGit('commit', '-m', 'chore(template): upgrade to Spernakit v9.1.0');
	const upgradeRev = appGit('rev-parse', 'HEAD');

	appGit('checkout', '-q', '-b', 'repaired', featureRev);
	writeAll(appDir, APP_REPAIRED);
	appGit('add', '-A');
	appGit('commit', '-m', 'chore(template): upgrade to Spernakit v9.1.0');
	const repairedRev = appGit('rev-parse', 'HEAD');
	appGit('checkout', '-q', 'main');

	const runRaw = (args: string[]): AuditRun => {
		const result = Bun.spawnSync(['bun', auditScript, ...args], {
			cwd: repoRoot,
			stderr: 'pipe',
			stdout: 'pipe',
		});
		return {
			exitCode: result.exitCode,
			output: `${result.stdout.toString()}${result.stderr.toString()}`,
		};
	};

	return {
		appDir,
		cleanup: (): void => rmSync(fixtureRoot, { force: true, recursive: true }),
		featureRev,
		repairedRev,
		run: (args): AuditRun => runRaw(['--app-dir', appDir, '--template', templateDir, ...args]),
		runRaw,
		templateDir,
		upgradeRev,
	};
}
