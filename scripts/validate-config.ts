#!/usr/bin/env bun
/**
 * Config Schema Validation
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
 * Usage:
 *   bun run config:validate
 *   bun run config:validate --json    # Output as JSON (for CI)
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appConfigSchema } from '../backend/src/config/configSchema.ts';
import { replaceSecretsWithEnvVars } from '../backend/src/config/configSecrets.ts';
import {
	deepMerge,
	ensureFrontendOrigin,
	getAppSlug,
	loadDefaults,
	projectRoot,
} from '../backend/src/config/configUtils.ts';
import {
	collectSecurityIssues,
	type ValidationIssue,
} from '../backend/src/config/configValidator.ts';

interface SchemaIssue {
	message: string;
	path: string;
}

interface FileValidation {
	errors: number;
	label: string;
	path: string;
	schemaIssues: SchemaIssue[];
	/** Security issues only collected for the live {slug}.json instance. */
	securityIssues: ValidationIssue[];
	status: 'fail' | 'pass' | 'skip';
	warnings: number;
}

interface ValidationReport {
	files: FileValidation[];
	status: 'fail' | 'pass';
}

function loadJson(path: string): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	} catch (err) {
		throw new Error(
			`Failed to parse config at ${path}: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err }
		);
	}
}

function parseSchemaIssues(
	parseResult: ReturnType<typeof appConfigSchema.safeParse>
): SchemaIssue[] {
	if (parseResult.success) return [];
	return parseResult.error.issues.map((issue) => ({
		message: issue.message,
		path: issue.path.join('.'),
	}));
}

function validateStandalone(label: string, path: string): FileValidation {
	const result: FileValidation = {
		errors: 0,
		label,
		path,
		schemaIssues: [],
		securityIssues: [],
		status: 'pass',
		warnings: 0,
	};

	if (!existsSync(path)) {
		result.status = 'skip';
		return result;
	}

	const raw = loadJson(path);
	delete raw['$schema'];

	const parse = appConfigSchema.safeParse(raw);
	result.schemaIssues = parseSchemaIssues(parse);
	result.errors = result.schemaIssues.length;
	if (result.errors > 0) result.status = 'fail';
	return result;
}

function validateInstance(): FileValidation {
	const defaults = loadDefaults();
	const slug = getAppSlug(defaults);
	const configPath = join(projectRoot, 'config', `${slug}.json`);

	const result: FileValidation = {
		errors: 0,
		label: 'instance',
		path: configPath,
		schemaIssues: [],
		securityIssues: [],
		status: 'pass',
		warnings: 0,
	};

	if (!existsSync(configPath)) {
		// Instance file is optional at validation time — it gets created from
		// defaults on first `bun run dev`. Skip rather than fail.
		result.status = 'skip';
		return result;
	}

	const userConfig = loadJson(configPath);
	const merged = deepMerge(defaults, userConfig);
	const withEnvVars = replaceSecretsWithEnvVars(merged, slug);
	ensureFrontendOrigin(withEnvVars);
	delete withEnvVars['$schema'];

	const parse = appConfigSchema.safeParse(withEnvVars);
	result.schemaIssues = parseSchemaIssues(parse);

	if (!parse.success) {
		result.errors = result.schemaIssues.length;
		result.status = 'fail';
		return result;
	}

	// Security validation only runs on the instance — it checks placeholder
	// secrets, minimum key lengths, and production-safety invariants.
	result.securityIssues = collectSecurityIssues(parse.data);
	for (const issue of result.securityIssues) {
		if (issue.level === 'error') result.errors++;
		else result.warnings++;
	}
	if (result.errors > 0) result.status = 'fail';
	return result;
}

function validate(): ValidationReport {
	const defaultsPath = join(projectRoot, 'backend/src/config/defaults.json');
	const examplePath = join(projectRoot, 'config/example.json');

	const files: FileValidation[] = [
		validateStandalone('defaults', defaultsPath),
		validateStandalone('example', examplePath),
		validateInstance(),
	];

	const anyFailed = files.some((f) => f.status === 'fail');
	return { files, status: anyFailed ? 'fail' : 'pass' };
}

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
				const tag = issue.level === 'error' ? 'ERROR' : 'WARN ';
				console.log(`    [${tag}] ${issue.field}: ${issue.message}`);
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
	console.log('\nSUMMARY');
	console.log(`  Errors: ${errors} | Warnings: ${warnings}`);
	if (report.status === 'pass' && warnings > 0) {
		console.log('  Status: PASS (warnings only)');
	} else {
		console.log(`  Status: ${report.status.toUpperCase()}`);
	}
	console.log('');
}

function main(): void {
	const jsonMode = process.argv.includes('--json');

	try {
		const report = validate();
		if (jsonMode) {
			console.log(JSON.stringify(report, null, '\t'));
		} else {
			printReport(report);
		}
		process.exit(report.status === 'pass' ? 0 : 1);
	} catch (err: unknown) {
		if (jsonMode) {
			console.log(
				JSON.stringify({
					error: err instanceof Error ? err.message : String(err),
					status: 'fail',
				})
			);
		} else {
			console.error(
				`Config validation error: ${err instanceof Error ? err.message : String(err)}`
			);
		}
		process.exit(1);
	}
}

main();
