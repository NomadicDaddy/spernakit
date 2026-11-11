/**
 * Production never loads swagger or the zod it carries (swagger-dev-only-loading).
 *
 * @elysiajs/swagger pulls in @scalar/types, which loads zod below 4.6.6, a high bun audit advisory.
 * app.ts reaches the docs module only through a dynamic import taken in development, and
 * create-api-app.ts imports only its type. This walks the real production import graph that
 * Bun's bundler resolves from backend/src/app.ts, following only static edges (import statements
 * and require calls, the ones evaluated whenever the app starts), and fails if any reaches
 * @elysiajs/swagger or zod. Positive control: the same walk from swaggerDocs.ts must reach both,
 * or this check could not see them at all. It also checks that the docs are still reachable
 * through app.ts's dynamic import, and that the build-time spec extractor imports them
 * dynamically too.
 *
 * Run: bun scripts/test-swagger-dev-only.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { exit } from 'node:process';

const root = join(import.meta.dir, '..');
const failures: string[] = [];
const SWAGGER = /(^|\/)node_modules\/(\.bun\/[^/]+\/node_modules\/)?@elysiajs\/swagger\//;
const ZOD = /(^|\/)node_modules\/(\.bun\/[^/]+\/node_modules\/)?zod\//;
const STATIC_KINDS = new Set(['import-statement', 'require-call']);

interface ImportEdge {
	external?: boolean;
	kind: string;
	path: string;
}

/** The bundler's resolved import graph, keyed by repository-relative path. */
async function importGraph(entry: string): Promise<Record<string, { imports: ImportEdge[] }>> {
	const result = await Bun.build({
		entrypoints: [join(root, entry)],
		metafile: true,
		packages: 'bundle',
		target: 'bun',
	});
	if (!result.success || !result.metafile)
		throw new Error(`bundling ${entry} failed: ${result.logs.map(String).join('; ')}`);
	return result.metafile.inputs as Record<string, { imports: ImportEdge[] }>;
}

/** Every module reached from `entry` through static edges only. */
function staticReach(graph: Record<string, { imports: ImportEdge[] }>, entry: string): string[] {
	const seen = new Set<string>([entry]);
	const queue = [entry];
	for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
		for (const edge of graph[next]?.imports ?? []) {
			if (edge.external || !STATIC_KINDS.has(edge.kind) || seen.has(edge.path)) continue;
			seen.add(edge.path);
			queue.push(edge.path);
		}
	}
	return [...seen];
}

const appGraph = await importGraph('backend/src/app.ts');
const production = staticReach(appGraph, 'backend/src/app.ts');
for (const [name, pattern] of [
	['@elysiajs/swagger', SWAGGER],
	['zod', ZOD],
] as const) {
	const hit = production.find((path) => pattern.test(path));
	if (hit) failures.push(`app.ts statically reaches ${name} (${hit}), so production loads it`);
}
const docsEdge = (appGraph['backend/src/app.ts']?.imports ?? []).find((edge) =>
	edge.path.endsWith('backend/src/swaggerDocs.ts'),
);
if (docsEdge?.kind !== 'dynamic-import')
	failures.push(
		`app.ts should reach swaggerDocs.ts through a dynamic import, found ${docsEdge?.kind ?? 'none'}`,
	);

const docsGraph = await importGraph('backend/src/swaggerDocs.ts');
const docs = staticReach(docsGraph, 'backend/src/swaggerDocs.ts');
if (!docs.some((path) => SWAGGER.test(path)))
	failures.push('control: swaggerDocs.ts does not reach @elysiajs/swagger');
if (!docs.some((path) => ZOD.test(path)))
	failures.push('control: swaggerDocs.ts does not reach zod');

const specExtract = readFileSync(join(root, 'scripts/lib/api-types/spec-extract.ts'), 'utf8');
if (!/await import\([^)]*swaggerDocs\.ts['"]\)/.test(specExtract))
	failures.push(
		'spec-extract.ts no longer imports swaggerDocs.ts dynamically, so docs may be lost',
	);

if (failures.length) {
	console.error('[FAIL] swagger is not development-only:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log(
	`[OK] app.ts's static graph (${String(production.length)} modules) reaches neither swagger nor zod; swaggerDocs.ts reaches both (control)`,
);
