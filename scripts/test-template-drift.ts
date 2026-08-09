#!/usr/bin/env bun
/**
 * Regression test for build-critical structural drift in branded files.
 *
 * The fixture drives the real drift and override CLIs against an isolated tagged template and
 * derived app. Branding-only changes must normalize away; removing a Docker build instruction must
 * fail with the missing line; KEEP/SKIP must transfer ownership to the override-delta report.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

const DOCKERFILE = 'Dockerfile';
const MISSING_INSTRUCTION = 'COPY scripts/require-bun.ts scripts/';
const TEMPLATE_DOCKERFILE = [
	'FROM oven/bun:1 AS base-builder',
	'WORKDIR /app',
	'LABEL org.opencontainers.image.title="Spernakit v3"',
	'COPY package.json bun.lock ./',
	MISSING_INSTRUCTION,
	'RUN bun install --frozen-lockfile',
	'',
].join('\n');
const APP_DOCKERFILE = TEMPLATE_DOCKERFILE.replace('Spernakit v3', 'Fixture App');
const TEMPLATE_README = '# Spernakit v3\n\nTemplate fixture.\n';
const APP_README = '# Fixture App\n\nTemplate fixture.\n';
const EXAMPLE_CONFIG = 'config/example.json';
const FRONTEND_PORT = 3330;
const BACKEND_PORT = 3331;

/** The branded subset of config/example.json: identity, cookies, database path, ports, origins. */
function exampleConfig(slug: string, name: string, description: string): string {
	return `${JSON.stringify(
		{
			app: { description, name, slug },
			cors: { frontendDevOrigins: [`http://localhost:${FRONTEND_PORT}`] },
			database: { url: `file:./data/${slug}.db` },
			security: {
				authCookieName: `${slug}_auth`,
				csrfCookieName: `${slug}_csrf`,
				refreshCookieName: `${slug}_refresh`,
			},
			server: {
				backendPort: BACKEND_PORT,
				backendUrl: `http://localhost:${BACKEND_PORT}`,
				frontendPort: FRONTEND_PORT,
				frontendUrl: `http://localhost:${FRONTEND_PORT}`,
			},
		},
		null,
		'\t',
	)}\n`;
}

const TEMPLATE_EXAMPLE = exampleConfig(
	'spernakit',
	'Spernakit v3',
	'Self-Hosted Multi-User Application Template',
);
const APP_EXAMPLE = exampleConfig('fixture-app', 'Fixture App', 'Fixture application');

interface RunResult {
	exitCode: number;
	output: string;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'template-drift-'));
const templateDir = join(fixtureRoot, 'template');
const appDir = join(fixtureRoot, 'app');

function write(root: string, relativePath: string, content: string): void {
	const target = join(root, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

function writeApp(relativePath: string, content: string): void {
	write(appDir, relativePath, content);
}

function runCli(script: string, args: string[] = [], env: Record<string, string> = {}): RunResult {
	const result = Bun.spawnSync(['bun', join(repoRoot, 'scripts', script), ...args], {
		cwd: appDir,
		// Runs the real drift CLI against a fixture app, so it needs the toolchain environment a
		// developer would have (PATH to reach `git` and `bun`); only APP_SLUG is fixture-specific.
		env: { ...process.env, APP_SLUG: 'fixture-app', ...env }, // allow-env-spread-policy
		stderr: 'pipe',
		stdout: 'pipe',
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

// Advisory mode is pinned off unless a case asks for it: init runs this suite under a `smoke:qc`
// that sets DRIFT_BRANDED_ADVISORY=1, and runCli inherits the real environment, so a bare call let
// the case that must fail (a deleted build instruction) pass as advisory. Empty is off (`=== '1'`).
function runDrift(env: Record<string, string> = {}): RunResult {
	return runCli('check-template-drift.ts', ['--template', templateDir], {
		DRIFT_BRANDED_ADVISORY: '',
		...env,
	});
}

function runOverrideReport(): RunResult {
	return runCli('check-override-deltas.ts', [
		'--template',
		templateDir,
		'--target-version',
		'9.0.0',
	]);
}

try {
	const manifest = `${JSON.stringify(
		{
			$comment: 'Build-critical branded fixture',
			branded: [DOCKERFILE, EXAMPLE_CONFIG, 'README.md', 'package.json'],
			buildCriticalBranded: [DOCKERFILE],
			infrastructure: [],
		},
		null,
		'\t',
	)}\n`;
	const templatePackage = `${JSON.stringify(
		{
			description: 'Spernakit v3 - Self-Hosted Multi-User Application Template',
			name: 'spernakit',
			version: '9.0.0',
		},
		null,
		'\t',
	)}\n`;
	const appPackage = `${JSON.stringify(
		{
			description: 'Fixture application',
			name: 'fixture-app',
			spernakit_version: '9.0.0',
			version: '1.0.0',
		},
		null,
		'\t',
	)}\n`;

	mkdirSync(templateDir, { recursive: true });
	const git = (...args: string[]): void => {
		const result = Bun.spawnSync(
			['git', '-C', templateDir, '-c', 'user.email=t@t', '-c', 'user.name=t', ...args],
			{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
		);
		if (result.exitCode !== 0) {
			throw new Error(`git ${args.join(' ')} failed: ${result.stderr.toString().trim()}`);
		}
	};
	git('init', '-b', 'main');
	write(templateDir, DOCKERFILE, TEMPLATE_DOCKERFILE);
	write(templateDir, EXAMPLE_CONFIG, TEMPLATE_EXAMPLE);
	write(templateDir, 'README.md', TEMPLATE_README);
	write(templateDir, 'package.json', templatePackage);
	write(templateDir, 'scripts/template-manifest.json', manifest);
	git('add', '-A');
	git('commit', '-m', 'v9.0.0');
	git('tag', 'v9.0.0');

	writeApp(DOCKERFILE, APP_DOCKERFILE);
	writeApp(EXAMPLE_CONFIG, APP_EXAMPLE);
	writeApp('README.md', APP_README);
	writeApp('package.json', appPackage);
	writeApp('scripts/template-manifest.json', manifest);
	writeApp(
		'config/fixture-app.json',
		`${JSON.stringify({
			app: {
				description: 'Fixture application',
				name: 'Fixture App',
				slug: 'fixture-app',
			},
			server: { backendPort: 3331, frontendPort: 3330 },
		})}\n`,
	);

	// Branding-only Dockerfile, README, and package differences all normalize away.
	const brandedOnly = runDrift();
	assert(
		brandedOnly.exitCode === 0,
		`Branding-only differences must not fail:\n${brandedOnly.output}`,
	);
	assert(
		brandedOnly.output.includes('Build-Critical Branded Files') &&
			brandedOnly.output.includes('No template drift detected'),
		`The clean report must classify the Dockerfile as build-critical:\n${brandedOnly.output}`,
	);

	// Removing the build instruction is the regression: one path, one missing structural line.
	const missingDockerfile = APP_DOCKERFILE.replace(`${MISSING_INSTRUCTION}\n`, '');
	writeApp(DOCKERFILE, missingDockerfile);
	const missingInstruction = runDrift();
	assert(
		missingInstruction.exitCode !== 0,
		`A missing build instruction must fail check:drift:\n${missingInstruction.output}`,
	);
	assert(
		missingInstruction.output.includes('BUILD-CRITICAL DRIFT') &&
			missingInstruction.output.includes(DOCKERFILE),
		`The failure must name the path and build-critical severity:\n${missingInstruction.output}`,
	);
	assert(
		missingInstruction.output.includes(`missing: ${MISSING_INSTRUCTION}`),
		`The failure must print the missing normalized line:\n${missingInstruction.output}`,
	);
	assert(
		missingInstruction.output.includes('1 file(s) need attention') &&
			!missingInstruction.output.includes('README.md '),
		`Only the missing Docker instruction may fail this fixture:\n${missingInstruction.output}`,
	);

	// Presentation-only branded files retain the ordinary branded verdict and wording.
	writeApp(DOCKERFILE, APP_DOCKERFILE);
	writeApp('README.md', `${APP_README}App-only structural text.\n`);
	const presentationDrift = runDrift();
	assert(
		presentationDrift.exitCode !== 0 && presentationDrift.output.includes('README.md'),
		`Presentation branded drift must retain its existing failure:\n${presentationDrift.output}`,
	);
	assert(
		!presentationDrift.output.includes('BUILD-CRITICAL DRIFT'),
		`Presentation drift must not be promoted to build-critical:\n${presentationDrift.output}`,
	);
	writeApp('README.md', APP_README);

	// config/example.json is the only tracked config a fresh clone of an app has, and setup used to
	// leave it holding the template's slug, cookie names and database path while `config/` sat in the
	// drift checker's excluded directories. Two assertions pin both halves of the repair: the path
	// has to be reachable by the checker at all, and its normalizer has to assert the app's branding
	// rather than erase it. Re-broadening the exclusion, or routing this file through
	// normalizeDefaultsJson, makes the unbranded copy below report clean.
	writeApp(EXAMPLE_CONFIG, TEMPLATE_EXAMPLE);
	const unbrandedExample = runDrift();
	assert(
		unbrandedExample.exitCode !== 0 && unbrandedExample.output.includes(EXAMPLE_CONFIG),
		`An example config still carrying the template's branding must drift:\n${unbrandedExample.output}`,
	);
	assert(
		!unbrandedExample.output.includes('BUILD-CRITICAL DRIFT'),
		`Example config drift is branded, not build-critical:\n${unbrandedExample.output}`,
	);
	writeApp(EXAMPLE_CONFIG, APP_EXAMPLE);
	const brandedExample = runDrift();
	assert(
		brandedExample.exitCode === 0,
		`A correctly branded example config must not drift:\n${brandedExample.output}`,
	);

	// Scaffold-time advisory mode continues to make every branded drift non-failing.
	writeApp(DOCKERFILE, missingDockerfile);
	const advisory = runDrift({ DRIFT_BRANDED_ADVISORY: '1' });
	assert(
		advisory.exitCode === 0 && advisory.output.includes('advisory at scaffold time'),
		`Build-critical branded drift must preserve scaffold advisory behavior:\n${advisory.output}`,
	);

	// KEEP and SKIP remove the path from drift ownership; only the override report prints its delta.
	for (const action of ['KEEP', 'SKIP'] as const) {
		writeApp('.templateoverrides', `${action} ${DOCKERFILE} # fixture freeze\n`);
		const suppressed = runDrift();
		assert(
			suppressed.exitCode === 0 &&
				suppressed.output.includes(`[${action}]`) &&
				!suppressed.output.includes('BUILD-CRITICAL DRIFT') &&
				!suppressed.output.includes(`missing: ${MISSING_INSTRUCTION}`),
			`${action} must suppress the normal drift finding:\n${suppressed.output}`,
		);
		const override = runOverrideReport();
		assert(
			override.exitCode === 0 &&
				override.output.includes('WITHHELD BY OVERRIDE') &&
				override.output.includes(MISSING_INSTRUCTION),
			`${action} must leave the missing line exclusively in the override report:\n${override.output}`,
		);
	}

	console.log(`Template build-critical drift test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
