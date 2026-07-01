/**
 * Result types and console/JSON reporting for API type contract validation.
 *
 * Extracted from scripts/validate-api-types.ts (max-lines split).
 */
import type { EnumMismatch } from './enum-validate.ts';

export interface ValidationResult {
	endpointCount: number;
	enumMismatches: EnumMismatch[];
	errors: number;
	specExtracted: boolean;
	status: 'fail' | 'pass';
	warnings: string[];
}

export function printResult(result: ValidationResult): void {
	console.log('\nAPI Type Contract Validation');
	console.log('');

	// Spec extraction
	console.log('SPEC EXTRACTION');
	if (result.specExtracted) {
		console.log(`  [PASS] OpenAPI spec extracted (${result.endpointCount} endpoints)`);
	} else {
		console.log('  [FAIL] Failed to extract OpenAPI spec from Elysia app');
	}
	console.log('');

	// Enum validation
	console.log('ENUM VALIDATION');
	if (result.enumMismatches.length === 0) {
		console.log('  [PASS] All enum types consistent between backend and frontend');
	} else {
		for (const m of result.enumMismatches) {
			console.log(`  [FAIL] ${m.name}`);
			if (m.missingInFrontend.length > 0) {
				console.log(`         Missing in frontend: ${m.missingInFrontend.join(', ')}`);
			}
			if (m.missingInBackend.length > 0) {
				console.log(`         Missing in backend:  ${m.missingInBackend.join(', ')}`);
			}
		}
	}
	console.log('');

	// Warnings
	if (result.warnings.length > 0) {
		console.log('WARNINGS');
		for (const w of result.warnings) {
			console.log(`  [WARN] ${w}`);
		}
		console.log('');
	}

	// Summary
	console.log('SUMMARY');
	console.log(`  Errors: ${result.errors} | Warnings: ${result.warnings.length}`);
	if (result.status === 'pass' && result.warnings.length > 0) {
		console.log('  Status: PASS (warnings only)');
	} else if (result.status === 'pass') {
		console.log('  Status: PASS');
	} else {
		console.log('  Status: FAIL');
	}
	console.log('');
}

export function printJsonResult(result: ValidationResult): void {
	console.log(JSON.stringify(result, null, '\t'));
}
