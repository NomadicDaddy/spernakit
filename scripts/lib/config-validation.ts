import { type AppConfig, appConfigSchema } from '../../backend/src/config/configSchema.ts';
import { replaceSecretsWithEnvVars } from '../../backend/src/config/configSecrets.ts';
import { deepMerge, ensureFrontendOrigin } from '../../backend/src/config/configUtils.ts';
import {
	collectSecurityIssues,
	type ValidationIssue,
} from '../../backend/src/config/configValidator.ts';

type NodeEnvironment = AppConfig['server']['nodeEnv'];

interface SchemaIssue {
	message: string;
	path: string;
}

interface MergedConfigValidation {
	schemaIssues: SchemaIssue[];
	securityIssues: ValidationIssue[];
}

interface JsonSchemaNode {
	properties?: Record<string, JsonSchemaNode>;
	required?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Find schema-required fields omitted from a standalone config before defaults are applied. */
function findMissingRequiredPaths(value: unknown, schema: JsonSchemaNode, prefix = ''): string[] {
	if (!isRecord(value) || !schema.properties || !schema.required) return [];

	const missing: string[] = [];
	for (const key of schema.required) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (!Object.hasOwn(value, key)) {
			missing.push(path);
			continue;
		}

		const childSchema = schema.properties[key];
		if (childSchema?.properties && isRecord(value[key])) {
			missing.push(...findMissingRequiredPaths(value[key], childSchema, path));
		}
	}
	return missing;
}

function parseNodeEnvironment(value: string): NodeEnvironment {
	switch (value) {
		case 'development':
		case 'production':
		case 'test':
			return value;
		default:
			throw new Error(
				`Invalid --node-env value "${value}". Expected development, production, or test.`,
			);
	}
}

function parseNodeEnvOverride(args: string[]): NodeEnvironment | undefined {
	for (let index = 0; index < args.length; index++) {
		const argument = args[index];
		if (argument === '--node-env') {
			const value = args[index + 1];
			if (value === undefined || value.startsWith('--')) {
				throw new Error('--node-env requires development, production, or test.');
			}
			return parseNodeEnvironment(value);
		}
		if (argument?.startsWith('--node-env=')) {
			return parseNodeEnvironment(argument.slice('--node-env='.length));
		}
	}
	return undefined;
}

function parseSchemaIssues(
	parseResult: ReturnType<typeof appConfigSchema.safeParse>,
): SchemaIssue[] {
	if (parseResult.success) return [];
	return parseResult.error.issues.map((issue) => ({
		message: issue.message,
		path: issue.path.join('.'),
	}));
}

/**
 * Validate a merged instance config without modifying either source object or writing to disk.
 * The optional environment override controls placeholder severity only. Other security checks use
 * the config's real environment, and config/{slug}.json is never modified.
 */
function validateMergedInstance(
	defaults: Record<string, unknown>,
	userConfig: Record<string, unknown>,
	slug: string,
	nodeEnvOverride?: NodeEnvironment,
): MergedConfigValidation {
	const merged = deepMerge(defaults, userConfig);
	const withEnvVars = replaceSecretsWithEnvVars(merged, slug);
	ensureFrontendOrigin(withEnvVars);
	delete withEnvVars['$schema'];

	const parse = appConfigSchema.safeParse(withEnvVars);
	if (!parse.success) {
		return { schemaIssues: parseSchemaIssues(parse), securityIssues: [] };
	}
	return {
		schemaIssues: [],
		securityIssues: collectSecurityIssues(parse.data, nodeEnvOverride),
	};
}

function formatSecurityIssue(issue: ValidationIssue): string {
	const tag = issue.level === 'error' ? 'ERROR' : 'WARN ';
	return `    [${tag}] ${issue.field}: ${issue.message}`;
}

export {
	findMissingRequiredPaths,
	formatSecurityIssue,
	type JsonSchemaNode,
	type MergedConfigValidation,
	type NodeEnvironment,
	parseNodeEnvOverride,
	type SchemaIssue,
	validateMergedInstance,
};
