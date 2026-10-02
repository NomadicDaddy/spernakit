#!/usr/bin/env bun
/**
 * Regression coverage for the application logger being the configured one.
 *
 * Every backend module imports `logger` before configuration exists, because ESM evaluates imports
 * first. The logger was built once at that moment, found no configuration, and stayed the
 * bootstrap logger for the life of the process: `logging.level`, the rotated file, the stderr copy
 * that fills `logs/<name>.error.log`, and the redaction of email addresses never applied.
 *
 * Holds three properties: an importer that bound `logger` before configuration loaded sees the
 * configured logger after `configureLogger`; the configured logger is not the bootstrap one; and
 * every entry point under backend/src that loads configuration also configures the logger.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { initializeConfig } from '../backend/src/config/configLoader.ts';
import { configLogger } from '../backend/src/config/configLogger.ts';
import * as loggerModule from '../backend/src/utils/logger.ts';

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
		// function is not counted.
		if (!/(?:=|^)\s*initializeConfig\(\)/m.test(code)) continue;
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

checkLiveBinding();
checkEveryEntryPointConfiguresTheLogger();

if (failures.length === 0) {
	console.log(`Configured-logger checks passed (${String(checks)} assertions).`);
} else {
	console.error('[FAIL] Configured-logger regression:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}
