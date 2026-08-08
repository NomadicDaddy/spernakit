/**
 * The `config:validate` report: what it examined and what it found.
 *
 * Split out of `scripts/validate-config.ts` so that file stays under the 300-line ceiling and so
 * the collection is importable without running the gate. `config-validation.ts` beside this file
 * holds the primitives -- merging, schema narrowing, security issue formatting; this holds the
 * per-file pass over the three config files and the envelope the gate emits.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { appConfigSchema, getConfigJsonSchema } from '../../backend/src/config/configSchema.ts';
import { getAppSlug, loadDefaults, projectRoot } from '../../backend/src/config/configUtils.ts';
import { type ValidationIssue } from '../../backend/src/config/configValidator.ts';
import {
	findMissingRequiredPaths,
	type JsonSchemaNode,
	type NodeEnvironment,
	parseSchemaIssues,
	type SchemaIssue,
	validateMergedInstance,
} from './config-validation.ts';

export interface FileValidation {
	errors: number;
	label: string;
	path: string;
	schemaIssues: SchemaIssue[];
	/** Security issues only collected for the live {slug}.json instance. */
	securityIssues: ValidationIssue[];
	status: 'fail' | 'pass' | 'skip';
	warnings: number;
}

/** One problem, flattened out of the per-file detail so the envelope carries a single list. */
export interface ConfigFinding {
	/** `defaults`, `example`, or `instance`. */
	file: string;
	/** `schema` or `security`. */
	kind: string;
	message: string;
	/** The config path the problem is at, or `(root)`. */
	path: string;
}

/**
 * The gate's report, in the envelope every `--json` gate in this repository emits.
 *
 * `examined` counts the files actually read, not the three candidates: `config/{slug}.json` is
 * created from defaults on first `bun run dev` and is legitimately absent before then, so a run
 * that skipped it has to be distinguishable from a run that validated it.
 */
export interface ValidationReport {
	examined: number;
	files: FileValidation[];
	findings: ConfigFinding[];
	gate: string;
	status: 'fail' | 'pass';
}

function loadJson(path: string): Record<string, unknown> {
	try {
		return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
	} catch (err) {
		throw new Error(
			`Failed to parse config at ${path}: ${err instanceof Error ? err.message : String(err)}`,
			{ cause: err },
		);
	}
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

	const missingPaths = findMissingRequiredPaths(raw, getConfigJsonSchema() as JsonSchemaNode);
	const parse = appConfigSchema.safeParse(raw);
	const missingSet = new Set(missingPaths);
	result.schemaIssues = [
		...missingPaths.map((fieldPath) => ({
			message: 'Required field must be explicitly present in a complete standalone config',
			path: fieldPath,
		})),
		...parseSchemaIssues(parse).filter((issue) => !missingSet.has(issue.path)),
	];
	result.errors = result.schemaIssues.length;
	if (result.errors > 0) result.status = 'fail';
	return result;
}

function validateInstance(nodeEnvOverride?: NodeEnvironment): FileValidation {
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
	const validation = validateMergedInstance(defaults, userConfig, slug, nodeEnvOverride);
	result.schemaIssues = validation.schemaIssues;
	if (result.schemaIssues.length > 0) {
		result.errors = result.schemaIssues.length;
		result.status = 'fail';
		return result;
	}

	// Security validation only runs on the instance — it checks placeholder
	// secrets, minimum key lengths, and production-safety invariants.
	result.securityIssues = validation.securityIssues;
	for (const issue of result.securityIssues) {
		if (issue.level === 'error') result.errors++;
		else result.warnings++;
	}
	if (result.errors > 0) result.status = 'fail';
	return result;
}

function findingsOf(file: FileValidation): ConfigFinding[] {
	return [
		...file.schemaIssues.map((issue) => ({
			file: file.label,
			kind: 'schema',
			message: issue.message,
			path: issue.path || '(root)',
		})),
		...file.securityIssues
			.filter((issue) => issue.level === 'error')
			.map((issue) => ({
				file: file.label,
				kind: 'security',
				message: issue.message,
				path: issue.field,
			})),
	];
}

/** Analyze the three config files and return the report. Pure with respect to stdout. */
export function collectConfigValidation(nodeEnvOverride?: NodeEnvironment): ValidationReport {
	const defaultsPath = join(projectRoot, 'backend/src/config/defaults.json');
	const examplePath = join(projectRoot, 'config/example.json');

	const files: FileValidation[] = [
		validateStandalone('defaults', defaultsPath),
		validateStandalone('example', examplePath),
		validateInstance(nodeEnvOverride),
	];

	const anyFailed = files.some((f) => f.status === 'fail');
	return {
		examined: files.filter((f) => f.status !== 'skip').length,
		files,
		findings: files.flatMap(findingsOf),
		gate: 'config:validate',
		status: anyFailed ? 'fail' : 'pass',
	};
}
