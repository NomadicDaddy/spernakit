#!/usr/bin/env bun
/**
 * One-shot extraction of the OpenAPI spec to docs/lts-baseline/openapi.json.
 * Used to capture the v3.13.0-lts API surface; consumed by check:lts-surface.
 */
import { writeFileSync } from 'node:fs';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { createApiApp } from '../backend/src/create-api-app.ts';

initializeConfig();
getConfig().rateLimit.enabled = false;
const app = createApiApp({ forceSwagger: true });
const response = await app.handle(new Request('http://localhost/api/v1/docs/json'));
const spec = (await response.json()) as { paths?: Record<string, Record<string, unknown>> };

let endpointCount = 0;
for (const methods of Object.values(spec.paths ?? {})) {
	for (const method of Object.keys(methods)) {
		if (['delete', 'get', 'patch', 'post', 'put'].includes(method)) endpointCount++;
	}
}

writeFileSync('docs/lts-baseline/openapi.json', JSON.stringify(spec, null, 2));
console.log(
	`OpenAPI baseline written: ${endpointCount} endpoints across ${Object.keys(spec.paths ?? {}).length} paths.`
);
