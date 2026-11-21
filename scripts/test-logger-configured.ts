#!/usr/bin/env bun
/**
 * Regression coverage for the application logger being the configured one.
 *
 * Every backend module imports `logger` before configuration exists, because ESM evaluates imports
 * first. The logger was built once at that moment, found no configuration, and stayed the
 * bootstrap logger for the life of the process: `logging.level`, the rotated file, the stderr copy
 * that fills `logs/<name>.error.log`, and the redaction of email addresses never applied.
 *
 * Holds four properties: an importer that bound `logger` before configuration loaded sees the
 * configured logger after `configureLogger`; the configured logger is not the bootstrap one; and
 * every entry point under backend/src that loads configuration also configures the logger; and
 * configured log files keep their destination when a CLI starts from another working directory.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { configLogger } from '../backend/src/config/configLogger.ts';
import * as loggerModule from '../backend/src/utils/logger.ts';
import { createChildEnv } from './lib/smoke/env.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const backendSrc = join(repoRoot, 'backend', 'src');
const failures: string[] = [];
let checks = 0;

function check(condition: boolean, message: string): void {
	checks += 1;
	if (!condition) failures.push(message);
}

function sourceFiles(directory: string): string[] {
	const files: string[] = [];
	for (const entry of readdirSync(directory, { withFileTypes: true })) {
		const path = join(directory, entry.name);
		if (entry.isDirectory()) files.push(...sourceFiles(path));
		else if (entry.name.endsWith('.ts')) files.push(path);
	}
	return files;
}

function checkLiveBinding(): void {
	check(
		loggerModule.logger === configLogger,
		'Before configuration loads, the application logger is the bootstrap logger',
	);
	loggerModule.configureLogger(initializeConfig());
	check(
		loggerModule.logger !== configLogger,
		'After configureLogger, an earlier importer must see the configured logger, not the bootstrap one',
	);
}

/** A call, not a mention: comment lines and the loader that defines the function are skipped. */
function checkEveryEntryPointConfiguresTheLogger(): void {
	const offenders: string[] = [];
	let entryPoints = 0;
	for (const file of sourceFiles(backendSrc)) {
		if (file.endsWith(join('config', 'configLoader.ts'))) continue;
		const code = readFileSync(file, 'utf8')
			.split('\n')
			.filter((line) => !/^\s*(?:\/\/|\*|\/\*)/.test(line))
			.join('\n');
		// As a statement or the right-hand side of an assignment, so a message that names the
		// function is not counted. An argument is allowed: app.ts passes its optional config
		// directory override through.
		if (!/(?:=|^)\s*initializeConfig\([^)]*\)/m.test(code)) continue;
		entryPoints += 1;
		if (!/\bconfigureLogger\(/.test(code)) offenders.push(relative(repoRoot, file));
	}
	check(
		entryPoints >= 2,
		`Expected app.ts and seed.ts to load configuration, found ${entryPoints}`,
	);
	check(
		offenders.length === 0,
		`Every entry point that loads configuration must call configureLogger: ${offenders.join(', ')}`,
	);
}

/** Exercise the real transport when a CLI starts outside the application root. */
function checkFilePathsIgnoreWorkingDirectory(): void {
	const temporaryRoot = mkdtempSync(join(tmpdir(), 'logger-working-directory-'));
	const relativeDirectory = join('logs', `logger-working-directory-${randomUUID()}`);
	const expectedRelativeDirectory = resolve(repoRoot, relativeDirectory);
	const absoluteDirectory = join(temporaryRoot, 'absolute');
	const fixture = join(import.meta.dir, 'lib', 'logger-file-fixture.ts');
	const logsRoot = resolve(repoRoot, 'logs') + sep;
	if (!expectedRelativeDirectory.startsWith(logsRoot)) {
		throw new Error('Logger fixture cleanup escaped the application logs directory');
	}
	const temporaryParent = resolve(tmpdir()) + sep;
	if (!resolve(temporaryRoot).startsWith(temporaryParent)) {
		throw new Error('Logger fixture cleanup escaped the temporary directory');
	}
	try {
		for (const [label, configuredPath, expectedDirectory] of [
			['relative', join(relativeDirectory, 'app.log'), expectedRelativeDirectory],
			['absolute', join(absoluteDirectory, 'app.log'), absoluteDirectory],
		] as const) {
			const child = Bun.spawnSync([process.execPath, fixture, '--file', configuredPath], {
				cwd: temporaryRoot,
				env: createChildEnv(),
				stderr: 'pipe',
				stdout: 'pipe',
				timeout: 10_000,
			});
			check(child.exitCode === 0, `${label} file logger exits successfully`);
			const logged = existsSync(expectedDirectory)
				? readdirSync(expectedDirectory).some((name) =>
						readFileSync(join(expectedDirectory, name), 'utf8').includes(
							'logger working-directory fixture',
						),
					)
				: false;
			check(logged, `${label} configured path receives the real log entry`);
		}
		check(
			!existsSync(join(temporaryRoot, relativeDirectory)),
			'A relative log path never creates a directory beneath the CLI working directory',
		);
	} finally {
		rmSync(expectedRelativeDirectory, { force: true, recursive: true });
		rmSync(temporaryRoot, { force: true, recursive: true });
	}
}

checkLiveBinding();
checkEveryEntryPointConfiguresTheLogger();
checkFilePathsIgnoreWorkingDirectory();

if (failures.length === 0) {
	console.log(`Configured-logger checks passed (${String(checks)} assertions).`);
} else {
	console.error('[FAIL] Configured-logger regression:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}
