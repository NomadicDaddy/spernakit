#!/usr/bin/env bun
/**
 * Smoke test runner - executes a chain of commands based on mode configuration.
 *
 * Usage:
 *   bun scripts/smoke.ts [--mode <mode>] [--force] [--fast] [--cache-status]
 *   bun scripts/smoke.ts --mode qc           # Run QC with caching
 *   bun scripts/smoke.ts --mode qc --force   # Bypass cache, run all steps
 *   bun scripts/smoke.ts --mode qc --fast    # Run the cached inner-loop subset
 *   bun scripts/smoke.ts --mode qc --cache-status  # Show what would run
 *   bun scripts/smoke.ts --mode dev          # Run dev mode (no caching)
 *
 * Flags:
 *   --mode, -m       Mode to run (default: dev). Modes defined in smoke.json.
 *   --force, -f      Bypass cache and run all steps (qc mode only)
 *   --fast           Run the inner-loop static subset (qc mode only)
 *   --cache-status   Show cache status without running (qc mode only)
 *
 * Caching (qc mode only):
 *   The qc mode tracks file changes and skips steps where no relevant files
 *   have changed since the last successful run. Cache stored in scripts/smoke-cache.json.
 *
 * Cross-platform: uses Bun.spawn with shell for command execution.
 */
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import {
	disableDevRateLimit,
	ensureDockerTestDirs,
	recoverDevRateLimitBackup,
} from './lib/smoke/config-fixups.ts';
import { FAST_QC_COMMANDS } from './lib/smoke/fast-subset.ts';
import {
	assertSmokeCacheCoverage,
	runCommand,
	showCacheStatus,
	type Step,
} from './lib/smoke/run-step.ts';
import { getShell } from './lib/smoke/shell.ts';
import { isSpernakitItself } from './lib/template/repo.ts';
import { loadJsonConfig } from './load-json-config.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

interface ModeConfig {
	steps: Step[];
}

interface SmokeConfig {
	modes: Record<string, ModeConfig>;
}

interface ParsedArguments {
	cacheStatus: boolean;
	fast: boolean;
	force: boolean;
	mode: string;
	screenshotPages: boolean;
}

function selectFastQcSteps(steps: Step[]): Step[] {
	const stepsByCommand = new Map(steps.map((step) => [step.command, step]));
	return FAST_QC_COMMANDS.map((command) => {
		const step = stepsByCommand.get(command);
		if (step === undefined)
			throw new Error(`Fast QC step is missing from smoke.json: ${command}`);
		return step;
	});
}

function parseArguments(): ParsedArguments {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			'cache-status': { default: false, type: 'boolean' },
			fast: { default: false, type: 'boolean' },
			force: { default: false, short: 'f', type: 'boolean' },
			mode: { default: 'dev', short: 'm', type: 'string' },
			'screenshot-pages': { default: false, type: 'boolean' },
		},
		strict: true,
	});

	return {
		cacheStatus: values['cache-status'] ?? false,
		fast: values.fast ?? false,
		force: values.force ?? false,
		mode: values.mode ?? 'dev',
		screenshotPages: values['screenshot-pages'] ?? false,
	};
}

function loadConfig(): SmokeConfig {
	// Load JSON config first — also provides port values for token substitution
	const { appSlug, config: appConfig } = loadJsonConfig(projectRoot);

	// Export env vars so docker compose commands inherit them via Bun.spawn()
	const frontendPort = String(appConfig.server?.frontendPort ?? '');
	const backendPort = String(appConfig.server?.backendPort ?? '');
	process.env.APP_SLUG ??= appSlug;
	process.env.FRONTEND_PORT ??= frontendPort;
	process.env.BACKEND_PORT ??= backendPort;
	// Production-compose smoke tests consume the local verification image built by
	// scripts/docker-image.ts. Never give this default a registry-qualified name.
	if (process.env.APP_VERSION === undefined) {
		const pkgRaw = readFileSync(join(projectRoot, 'package.json'), 'utf-8');
		const pkg = JSON.parse(pkgRaw) as { version?: string };
		if (typeof pkg.version === 'string' && pkg.version.length > 0) {
			process.env.APP_VERSION = pkg.version;
		}
	}
	process.env.APP_IMAGE ??= `${appSlug}-test:${process.env.APP_VERSION ?? 'latest'}`;
	// Default docker volume roots to an OS temp directory outside the source tree.
	// Operators can pin stable roots with APPDATA_ROOT and BACKUPS_ROOT.
	const defaultDockerRoot = join(tmpdir(), `${appSlug}-test`);
	process.env.APPDATA_ROOT ??= defaultDockerRoot;
	process.env.BACKUPS_ROOT ??= defaultDockerRoot;

	const configPath = join(__dirname, 'smoke.json');

	if (!existsSync(configPath)) {
		console.error(`Configuration file not found: ${configPath}`);
		process.exit(1);
	}

	// Substitute {{APP_SLUG}}, {{FRONTEND_PORT}}, and {{BACKEND_PORT}} tokens from app config
	const configRaw = readFileSync(configPath, 'utf-8')
		.replaceAll('{{APP_SLUG}}', appSlug)
		.replaceAll('{{FRONTEND_PORT}}', frontendPort)
		.replaceAll('{{BACKEND_PORT}}', backendPort);

	return JSON.parse(configRaw) as SmokeConfig;
}

function ensureLogsDirectory(): void {
	const logsPath = join(projectRoot, 'logs');
	if (!existsSync(logsPath)) {
		mkdirSync(logsPath, { recursive: true });
	}
}

async function main(): Promise<void> {
	console.log("Don't Panic.");

	const { cacheStatus, fast, force, mode, screenshotPages } = parseArguments();
	const config = loadConfig();
	const shell = getShell();

	console.log(`Running smoke tests for mode: ${mode}`);

	const modeKey = mode.toLowerCase();
	const modeConfig = config.modes[modeKey];

	if (!modeConfig) {
		console.error(`Unknown mode: ${mode}`);
		const availableModes = Object.keys(config.modes).join(', ');
		console.error(`Available modes: ${availableModes}`);
		process.exit(1);
	}
	if (fast && modeKey !== 'qc') {
		throw new Error('--fast can only be used with --mode qc.');
	}
	if (modeKey === 'qc') assertSmokeCacheCoverage(modeConfig.steps);
	const selectedSteps = fast ? selectFastQcSteps(modeConfig.steps) : modeConfig.steps;

	ensureLogsDirectory();
	recoverDevRateLimitBackup(projectRoot);
	if (modeKey === 'docker-prod' || modeKey === 'docker-local') {
		ensureDockerTestDirs(projectRoot, modeKey);
	}

	// Handle --cache-status flag
	if (cacheStatus) {
		await showCacheStatus(projectRoot, selectedSteps);
		return;
	}

	// Caching only applies to qc mode
	const useCache = modeKey === 'qc';

	if (force && useCache) {
		console.log('[FORCE] Bypassing cache, running all steps');
	}

	// Dev-mode crawl tests hit the backend directly against config/{slug}.json,
	// so the docker-prod-only override doesn't cover them. Disable rate-limit
	// in-place for the duration of the run and always restore afterward.
	const modesThatCrawlDev = new Set(['dev', 'screenshots']);
	const restoreDevConfig = modesThatCrawlDev.has(modeKey)
		? disableDevRateLimit(projectRoot)
		: () => {};
	const exitHandler = (): void => restoreDevConfig();
	process.on('exit', exitHandler);
	process.on('SIGINT', exitHandler);
	process.on('SIGTERM', exitHandler);
	process.on('uncaughtException', exitHandler);

	// qc steps are order-independent static checks, so run them ALL and report the
	// aggregate: fail-fast let one persistently red step (unacknowledged template
	// drift) mask every later gate — max-lines violations accumulated unseen behind
	// it. Server-lifecycle modes keep fail-fast; their steps genuinely depend on
	// their predecessors.
	const aggregateFailures = modeKey === 'qc';
	const failedSteps: string[] = [];
	try {
		const isTemplate = isSpernakitItself(projectRoot);
		for (const step of selectedSteps) {
			if (step.templateOnly && !isTemplate) {
				console.log(`[SKIP] ${step.description} (spernakit-only step)`);
				continue;
			}
			let command = step.command;

			// Pass --screenshot-pages through to crawltest commands
			if (screenshotPages && command.includes('crawltest')) {
				command = command.replace('crawltest.ts', 'crawltest.ts --screenshot-pages');
			}

			const exitCode = await runCommand(
				projectRoot,
				command,
				step.description,
				shell,
				force,
				useCache,
				step.logFile,
				aggregateFailures
			);
			if (exitCode !== 0) failedSteps.push(step.description);
		}
	} finally {
		restoreDevConfig();
	}

	if (failedSteps.length > 0) {
		console.error(`\n${failedSteps.length} step(s) failed for mode '${mode}':`);
		for (const description of failedSteps) console.error(`  [FAIL] ${description}`);
		process.exit(1);
	}

	console.log(`\nAll smoke tests for mode '${mode}' completed successfully.`);
}

main().catch((err: unknown) => {
	console.error('Fatal error:', (err as Error).message);
	process.exit(1);
});
