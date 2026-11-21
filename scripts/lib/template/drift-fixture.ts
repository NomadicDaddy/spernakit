/**
 * Fixture content for test-template-drift.ts: a branded Dockerfile, README and config/example.json
 * as the template and as a derived app would carry them. Kept apart so the test stays under the
 * line cap; the values are unchanged.
 */
export const DOCKERFILE = 'Dockerfile';
export const MISSING_INSTRUCTION = 'COPY scripts/require-bun.ts scripts/';
export const TEMPLATE_DOCKERFILE = [
	'FROM oven/bun:1 AS base-builder',
	'WORKDIR /app',
	'LABEL org.opencontainers.image.title="Spernakit v3"',
	'COPY package.json bun.lock ./',
	MISSING_INSTRUCTION,
	'RUN bun install --frozen-lockfile',
	'',
].join('\n');
export const APP_DOCKERFILE = TEMPLATE_DOCKERFILE.replace('Spernakit v3', 'Fixture App');
export const TEMPLATE_README = '# Spernakit v3\n\nTemplate fixture.\n';
export const APP_README = '# Fixture App\n\nTemplate fixture.\n';
export const EXAMPLE_CONFIG = 'config/example.json';
const FRONTEND_PORT = 3330;
const BACKEND_PORT = 3331;

/** The branded subset of config/example.json: identity, cookies, database path, ports, origins. */
function exampleConfig(slug: string, name: string, description: string): string {
	return `${JSON.stringify(
		{
			app: { description, name, slug },
			cors: { frontendDevOrigins: [`http://localhost:${FRONTEND_PORT}`] },
			database: { url: `file:./data/${slug}.db` },
			security: {
				authCookieName: `${slug}_auth`,
				csrfCookieName: `${slug}_csrf`,
				refreshCookieName: `${slug}_refresh`,
			},
			server: {
				backendPort: BACKEND_PORT,
				backendUrl: `http://localhost:${BACKEND_PORT}`,
				frontendPort: FRONTEND_PORT,
				frontendUrl: `http://localhost:${FRONTEND_PORT}`,
			},
		},
		null,
		'\t',
	)}\n`;
}

export const TEMPLATE_EXAMPLE = exampleConfig(
	'spernakit',
	'Spernakit v3',
	'Self-Hosted Multi-User Application Template',
);
export const APP_EXAMPLE = exampleConfig('fixture-app', 'Fixture App', 'Fixture application');
