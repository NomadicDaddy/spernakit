import { swagger } from '@elysiajs/swagger';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from './config/configLoader.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * The Swagger/OpenAPI docs plugin, served at /api/v1/docs.
 *
 * Kept in its own module so production never loads it: @elysiajs/swagger pulls in @scalar/types,
 * which loads zod below 4.6.6 (a high bun audit advisory, swagger-dev-only-loading). Only the
 * development server, the build-time spec extractor and the gate's route fixtures import this
 * file, and they do it with a dynamic import; create-api-app.ts takes the built plugin as an
 * option and imports only its type. Config must be initialised before calling this.
 *
 * @returns The swagger plugin for createApiApp's `docs` option.
 */
function swaggerDocs() {
	const config = getConfig();
	const { version } = JSON.parse(
		readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf8'),
	) as { version: string };
	return swagger({
		documentation: {
			info: {
				description: config.app.description,
				title: config.app.name,
				version,
			},
		},
		path: '/docs',
	});
}

type SwaggerDocs = ReturnType<typeof swaggerDocs>;

export { swaggerDocs };
export type { SwaggerDocs };
