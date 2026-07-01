#!/usr/bin/env bun
import type { TypeBoxUnionSchema } from './lib/api-types/enum-sources.ts';
import type { ValidationResult } from './lib/api-types/report.ts';

/**
 * OpenAPI Spec vs Frontend Type Contract Validation
 *
 * Extracts the OpenAPI spec from the Elysia app (without starting a server)
 * and validates that frontend type definitions are consistent with backend
 * route schemas. Focuses on enum/union type consistency — the highest-value
 * check for catching contract drift.
 *
 * Usage:
 *   bun run check:api-types
 *   bun run check:api-types --json    # Output as JSON (for CI)
 */
import {
	ApiKeyScopeSchema,
	NotificationTypeSchema,
	UserRoleSchema,
} from '../backend/src/schemas/domain.ts';
import { extractTypeBoxEnumValues } from './lib/api-types/enum-sources.ts';
import { validateEnums } from './lib/api-types/enum-validate.ts';
import { printJsonResult, printResult } from './lib/api-types/report.ts';
import { extractOpenAPISpec, findSpecEnumValues } from './lib/api-types/spec-extract.ts';

async function main(): Promise<void> {
	const jsonMode = process.argv.includes('--json');

	const result: ValidationResult = {
		endpointCount: 0,
		enumMismatches: [],
		errors: 0,
		specExtracted: false,
		status: 'pass',
		warnings: [],
	};

	try {
		// 1. Extract OpenAPI spec (validates spec generation works)
		const specResult = await extractOpenAPISpec();
		if (specResult) {
			result.specExtracted = true;
			result.endpointCount = specResult.endpointCount;

			// Cross-check: find all enum-like schemas in the spec
			const specEnums = new Map<string, Set<string>>();
			findSpecEnumValues(specResult.spec.paths, specEnums);

			// Verify known enums appear in the spec
			const knownEnums = [
				{
					name: 'NotificationType',
					values: extractTypeBoxEnumValues(
						NotificationTypeSchema as unknown as TypeBoxUnionSchema
					),
				},
				{
					name: 'ApiKeyScope',
					values: extractTypeBoxEnumValues(
						ApiKeyScopeSchema as unknown as TypeBoxUnionSchema
					),
				},
				{
					name: 'UserRole',
					values: extractTypeBoxEnumValues(
						UserRoleSchema as unknown as TypeBoxUnionSchema
					),
				},
			];
			for (const known of knownEnums) {
				const key = known.values.sort().join(',');
				if (!specEnums.has(key)) {
					result.warnings.push(
						`${known.name} enum not found in OpenAPI spec request schemas ` +
							`(may only appear in response examples)`
					);
				}
			}
		} else {
			result.errors++;
			result.status = 'fail';
		}

		// 2. Validate enum consistency (backend TypeBox vs frontend types)
		result.enumMismatches = validateEnums();
		result.errors += result.enumMismatches.length;

		if (result.errors > 0) {
			result.status = 'fail';
		}

		if (jsonMode) {
			printJsonResult(result);
		} else {
			printResult(result);
		}

		process.exit(result.status === 'pass' ? 0 : 1);
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
				`API type validation error: ${err instanceof Error ? err.message : String(err)}`
			);
		}
		process.exit(1);
	}
}

await main();
