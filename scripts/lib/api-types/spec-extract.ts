/**
 * OpenAPI spec extraction and enum cross-check helpers.
 *
 * Extracted from scripts/validate-api-types.ts (max-lines split). Extracts
 * the OpenAPI spec from the Elysia app (without starting a server) and walks
 * it for anyOf/const enum patterns.
 */
import { getConfig, initializeConfig } from '../../../backend/src/config/configLoader.ts';
import { createApiApp } from '../../../backend/src/create-api-app.ts';

export interface OpenAPISpec {
	info: { title: string; version: string };
	paths: Record<string, Record<string, unknown>>;
}

export async function extractOpenAPISpec(): Promise<{
	endpointCount: number;
	spec: OpenAPISpec;
} | null> {
	try {
		initializeConfig();
		// Disable rate limiting for spec extraction — no database is available and
		// rate limiting is irrelevant when extracting the OpenAPI schema.
		getConfig().rateLimit.enabled = false;
		const app = createApiApp({ forceSwagger: true });

		const response = await app.handle(new Request('http://localhost/api/v1/docs/json'));

		if (!response.ok) {
			return null;
		}

		const spec = (await response.json()) as OpenAPISpec;

		// Count endpoints (each path + method combination)
		let endpointCount = 0;
		for (const methods of Object.values(spec.paths ?? {})) {
			for (const method of Object.keys(methods as Record<string, unknown>)) {
				if (['delete', 'get', 'patch', 'post', 'put'].includes(method)) {
					endpointCount++;
				}
			}
		}

		return { endpointCount, spec };
	} catch {
		return null;
	}
}

/** Walk the OpenAPI spec to find all anyOf/oneOf enum schemas and compare
 *  against the known backend TypeBox schemas. This catches cases where inline
 *  route schemas diverge from the canonical schemas/domain.ts definitions. */
export function findSpecEnumValues(obj: unknown, results: Map<string, Set<string>>): void {
	if (obj === null || obj === undefined || typeof obj !== 'object') return;

	const record = obj as Record<string, unknown>;

	// Check for anyOf with const values (TypeBox union pattern in OpenAPI 3.1)
	if (Array.isArray(record['anyOf'])) {
		const values: string[] = [];
		for (const item of record['anyOf'] as Record<string, unknown>[]) {
			if (typeof item['const'] === 'string') {
				values.push(item['const']);
			}
		}
		if (values.length > 0) {
			const key = values.sort().join(',');
			const existing = results.get(key);
			if (existing) {
				for (const v of values) existing.add(v);
			} else {
				results.set(key, new Set(values));
			}
		}
	}

	// Recurse into all values
	for (const value of Object.values(record)) {
		if (typeof value === 'object' && value !== null) {
			findSpecEnumValues(value, results);
		}
	}
}
