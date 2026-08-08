#!/usr/bin/env bun
/**
 * validate-config.ts
 *
 * Validates three config files against the TypeBox config schema:
 *
 *   1. backend/src/config/defaults.json  — must be a complete, schema-valid
 *      baseline. Parsed directly (no merge) because it is *the* source of
 *      defaults; any missing required field is a bug in the template.
 *
 *   2. config/example.json               — must be schema-valid in isolation.
 *      This is the file users copy when bootstrapping, so it must represent
 *      a complete, working configuration.
 *
 *   3. config/{slug}.json                — the live instance. Deep-merged
 *      with defaults + env-var secret substitution, then schema + security
 *      checks. This is the original config:validate behavior, preserved.
 *
 * Why validate all three: schemas evolve faster than JSON files. When a
 * new required field is added to a schema, it's easy to forget to update
 * defaults/example — and that mismatch is exactly the drift this guard catches.
 *
 * This file holds the gate's presentation: argument parsing, the human-readable report, and the
 * exit code. The pass over the three files and the `--json` envelope live in `lib/config-report.ts`,
 * split out when this file went over the 300-line ceiling `check:max-lines` enforces.
 *
 * Enforces: every shipped config file conforms to the TypeBox config schema, and the live
 * instance additionally passes the production security checks. No assertion ID: `.aidd/` lists
 * `config:validate` under the `config-validator` enforcement kind rather than under an
 * ASSERT- number.
 *
 * Run: bun run config:validate [--json] [-- --node-env development|production|test]
 */
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import { projectRoot } from '../backend/src/config/configUtils.ts';
import {
	collectConfigValidation,
	type FileValidation,
	type ValidationReport,
} from './lib/config-report.ts';
import { formatSecurityIssue, parseNodeEnvironment } from './lib/config-validation.ts';

function printFile(file: FileValidation): void {
	const relPath = file.path.replace(projectRoot, '').replace(/^[/\\]/, '');
	console.log(`\n${file.label.toUpperCase()}: ${relPath}`);

	if (file.status === 'skip') {
		console.log('  [SKIP] File not present');
		return;
	}

	console.log('  SCHEMA');
	if (file.schemaIssues.length === 0) {
		console.log('    [PASS] All sections valid');
	} else {
		for (const issue of file.schemaIssues) {
			console.log(`    [FAIL] ${issue.path || '(root)'}: ${issue.message}`);
		}
	}

	if (file.label === 'instance' && file.schemaIssues.length === 0) {
		console.log('  SECURITY');
		if (file.securityIssues.length === 0) {
			console.log('    [PASS] All checks passed');
		} else {
			for (const issue of file.securityIssues) {
				console.log(formatSecurityIssue(issue));
			}
		}
	}
}

function printReport(report: ValidationReport): void {
	console.log('\nConfig Validation');

	for (const file of report.files) {
		printFile(file);
	}

	const errors = report.files.reduce((n, f) => n + f.errors, 0);
	const warnings = report.files.reduce((n, f) => n + f.warnings, 0);
	const skipped = report.files.length - report.examined;
	console.log('\nSUMMARY');
	console.log(`  Errors: ${errors} | Warnings: ${warnings}`);
	if (report.status === 'fail') {
		console.log(
			`[FAIL] config:validate -- ${errors} error(s) across ${report.examined} files.`,
		);
		return;
	}
	console.log(
		`[OK] config:validate -- ${report.examined} config file(s) validated, ` +
			`${skipped} not present, ${warnings} warning(s).`,
	);
}

export interface ConfigValidateOptions {
	json?: boolean | undefined;
	nodeEnv?: string | undefined;
}

/**
 * Run the gate. Returns the process exit code: 0 pass, 1 findings.
 *
 * A config file that will not parse exits 1 rather than 2. An unreadable config is not this gate
 * failing to run; it is the defect the gate exists to report, and the only difference between it
 * and a schema violation is which layer noticed.
 */
export function runConfigValidate(options: ConfigValidateOptions = {}): number {
	const jsonMode = options.json === true;

	try {
		const nodeEnvOverride =
			options.nodeEnv === undefined ? undefined : parseNodeEnvironment(options.nodeEnv);
		const report = collectConfigValidation(nodeEnvOverride);
		if (jsonMode) {
			console.log(JSON.stringify(report, null, '\t'));
		} else {
			printReport(report);
		}
		return report.status === 'pass' ? 0 : 1;
	} catch (err: unknown) {
		const message = err instanceof Error ? err.message : String(err);
		if (jsonMode) {
			console.log(
				JSON.stringify({
					examined: 0,
					findings: [{ file: '(unknown)', kind: 'error', message, path: '(root)' }],
					gate: 'config:validate',
					status: 'fail',
				}),
			);
		} else {
			console.error(`[FAIL] config:validate -- ${message}`);
		}
		return 1;
	}
}

if (import.meta.main) {
	// `parseArgs` throws on an unknown flag, and an uncaught throw exits 1 -- the code reserved for
	// a real config finding. A mistyped flag reporting "config validation failed" is exactly the
	// confusion the exit codes exist to end, so bad arguments are caught and mapped onto 2 here.
	let options: ConfigValidateOptions;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: {
				json: { type: 'boolean' },
				'node-env': { type: 'string' },
			},
			strict: true,
		});
		options = { json: values.json, nodeEnv: values['node-env'] };
	} catch (err) {
		console.error(`[FAIL] config:validate: ${(err as Error).message}`);
		console.error(
			'Usage: config:validate [--json] [-- --node-env development|production|test]',
		);
		exit(2);
	}
	exit(runConfigValidate(options));
}
