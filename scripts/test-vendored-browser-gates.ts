#!/usr/bin/env bun
/**
 * Regression for the derived-app gate treatment of the vendored spernakit-browser tool.
 *
 * `scripts/sb.ts` is covered by the root `scripts/*.ts` Knip entry, while the daemon starts as a
 * separate process and must be declared explicitly. The tool remains analyzable by Knip, but its
 * intentionally self-contained browser-evaluation modules are outside the app-owned max-lines
 * policy.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

interface CommandResult {
	code: number;
	output: string;
}

interface KnipConfig {
	workspaces: {
		'.': {
			entry: string[];
		};
	};
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function lines(count: number, prefix: string): string {
	return Array.from({ length: count }, (_, index) => `// ${prefix} ${index + 1}`).join('\n');
}

function writeFixtureFile(root: string, relativePath: string, contents: string): void {
	const fullPath = join(root, relativePath);
	mkdirSync(dirname(fullPath), { recursive: true });
	writeFileSync(fullPath, contents);
}

async function runPackageCommand(root: string, script: string): Promise<CommandResult> {
	const process = Bun.spawn(['bun', 'run', script], {
		cwd: root,
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const [code, stderr, stdout] = await Promise.all([
		process.exited,
		new Response(process.stderr).text(),
		new Response(process.stdout).text(),
	]);
	return { code, output: `${stdout}${stderr}` };
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'vendored-browser-gates-'));
const shippedKnipText = readFileSync(join(repoRoot, 'knip.json'), 'utf8');
const shippedKnip = JSON.parse(shippedKnipText) as KnipConfig;
const maxLinesSource = readFileSync(join(repoRoot, 'scripts/check-max-lines.ts'), 'utf8');
const browserEntryPattern = 'scripts/{*,spernakit-browser/daemon}.ts';

try {
	const rootEntries = shippedKnip.workspaces['.'].entry;
	assert(
		rootEntries.includes(browserEntryPattern),
		'The shipped Knip config must cover scripts/sb.ts and the separately spawned daemon',
	);

	writeFixtureFile(
		fixtureRoot,
		'package.json',
		JSON.stringify(
			{
				name: 'derived-app-fixture',
				private: true,
				scripts: {
					'check:dead-code': 'bunx knip',
					'check:max-lines': 'bun scripts/check-max-lines.ts',
				},
				type: 'module',
				workspaces: ['backend', 'frontend', 'shared'],
			},
			null,
			'\t',
		),
	);
	writeFixtureFile(fixtureRoot, 'knip.json', shippedKnipText);
	writeFixtureFile(fixtureRoot, 'scripts/check-max-lines.ts', maxLinesSource);
	writeFixtureFile(
		fixtureRoot,
		'scripts/sb.ts',
		"import { daemonPath } from './spernakit-browser/client.ts';\nconsole.log(daemonPath());\n",
	);
	writeFixtureFile(
		fixtureRoot,
		'scripts/spernakit-browser/client.ts',
		"export const daemonPath = (): string => './daemon.ts';\n",
	);
	writeFixtureFile(
		fixtureRoot,
		'scripts/spernakit-browser/daemon.ts',
		`import './snapshot.ts';\n${lines(329, 'daemon')}`,
	);
	writeFixtureFile(fixtureRoot, 'scripts/spernakit-browser/snapshot.ts', lines(330, 'snapshot'));
	writeFixtureFile(fixtureRoot, 'scripts/app-owned.ts', lines(300, 'app-owned'));
	writeFixtureFile(
		fixtureRoot,
		'backend/package.json',
		'{"name":"fixture-backend","private":true,"type":"module"}\n',
	);
	writeFixtureFile(fixtureRoot, 'backend/src/create-api-app.ts', 'export const app = {};\n');
	writeFixtureFile(
		fixtureRoot,
		'frontend/package.json',
		'{"name":"fixture-frontend","private":true,"type":"module"}\n',
	);
	writeFixtureFile(fixtureRoot, 'frontend/src/App.tsx', 'export const App = (): null => null;\n');
	writeFixtureFile(fixtureRoot, 'frontend/src/routes.tsx', "import './App.tsx';\n");
	writeFixtureFile(
		fixtureRoot,
		'shared/package.json',
		'{"name":"fixture-shared","private":true,"type":"module"}\n',
	);

	let result = await runPackageCommand(fixtureRoot, 'check:dead-code');
	assert(result.code === 0, `Vendored tool must pass check:dead-code:\n${result.output}`);
	assert(
		!result.output.includes('spernakit-browser/'),
		'Passing dead-code output must not report the vendored browser subtree',
	);

	result = await runPackageCommand(fixtureRoot, 'check:max-lines');
	assert(result.code === 0, `Vendored tool must pass check:max-lines:\n${result.output}`);
	assert(
		!result.output.includes('spernakit-browser/'),
		'Passing max-lines output must not report the vendored browser subtree',
	);
	assert(
		!existsSync(join(fixtureRoot, '.templateoverrides')),
		'The derived fixture must need no .templateoverrides entry',
	);

	const missingDaemonEntry = structuredClone(shippedKnip);
	missingDaemonEntry.workspaces['.'].entry = rootEntries.map((entry) =>
		entry === browserEntryPattern ? 'scripts/*.ts' : entry,
	);
	writeFixtureFile(fixtureRoot, 'knip.json', JSON.stringify(missingDaemonEntry, null, '\t'));
	result = await runPackageCommand(fixtureRoot, 'check:dead-code');
	assert(result.code === 1, 'Removing the daemon entry must make check:dead-code fail');
	assert(
		result.output.includes('scripts/spernakit-browser/daemon.ts'),
		'The dead-code failure must identify the unreachable daemon',
	);

	writeFixtureFile(fixtureRoot, 'knip.json', shippedKnipText);
	writeFixtureFile(fixtureRoot, 'scripts/app-owned.ts', lines(301, 'app-owned'));
	result = await runPackageCommand(fixtureRoot, 'check:max-lines');
	assert(result.code === 1, 'An oversized app-owned script must still fail check:max-lines');
	assert(
		result.output.includes('scripts/app-owned.ts:301'),
		'The max-lines failure must identify the oversized app-owned script',
	);
	assert(
		!result.output.includes('spernakit-browser/'),
		'The max-lines failure must not include oversized vendored browser files',
	);

	console.log(`vendored browser gate regression passed (${checks} assertions).`);
} catch (err) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
