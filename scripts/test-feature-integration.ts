#!/usr/bin/env bun
/**
 * Regression test for flat backend route-module mount detection.
 *
 * The fixture drives the real package command against an isolated project. A flat Elysia route
 * must fail when unmounted, including when only an unmounted barrel references it, while a mounted
 * barrel chain and non-route helpers must pass.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';

interface RunResult {
	exitCode: number;
	output: string;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'feature-integration-'));

function write(relativePath: string, content: string): void {
	const target = join(fixtureRoot, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content, 'utf8');
}

function runCheck(): RunResult {
	const result = Bun.spawnSync(
		['bun', 'run', 'check:feature-integration', '--', '--root', fixtureRoot],
		{
			cwd: repoRoot,
			stderr: 'pipe',
			stdout: 'pipe',
		},
	);
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

try {
	write('frontend/src/routes/lazyPages.ts', 'export {};\n');
	mkdirSync(join(fixtureRoot, 'frontend/src/pages'), { recursive: true });
	mkdirSync(join(fixtureRoot, 'frontend/src/components'), { recursive: true });
	write(
		'backend/src/create-api-app.ts',
		"import { Elysia } from 'elysia';\nexport const createApiApp = () => new Elysia();\n",
	);
	write(
		'backend/src/routes/admin.ts',
		[
			"import { Elysia } from 'elysia';",
			"export const adminRoutes = new Elysia({ prefix: '/admin' }).get('/', () => 'ok');",
			'',
		].join('\n'),
	);
	write('backend/src/routes/types.ts', 'export interface RouteContext { requestId: string }\n');

	let result = runCheck();
	assert(result.exitCode !== 0, `An unmounted flat route must fail:\n${result.output}`);
	assert(
		result.output.includes('backend/src/routes/admin.ts') &&
			result.output.includes('adminRoutes'),
		`The flat-route failure must name its path and export:\n${result.output}`,
	);

	write(
		'backend/src/routes/index.ts',
		[
			"import { Elysia } from 'elysia';",
			"import { adminRoutes } from './admin.ts';",
			'const apiRoutes = new Elysia().use(adminRoutes);',
			'export { apiRoutes };',
			'',
		].join('\n'),
	);
	result = runCheck();
	assert(
		result.exitCode !== 0 && result.output.includes('backend/src/routes/admin.ts'),
		`An unmounted barrel must not make its child reachable:\n${result.output}`,
	);

	write(
		'backend/src/create-api-app.part1.ts',
		[
			"import { Elysia } from 'elysia';",
			"import { apiRoutes } from './routes/index.ts';",
			'export const routePlugins = new Elysia().use(apiRoutes);',
			'',
		].join('\n'),
	);
	result = runCheck();
	assert(result.exitCode === 0, `A mounted barrel chain must pass:\n${result.output}`);
	assert(
		result.output.includes('[OK] Feature integration check passed.'),
		`The passing fixture must print the checker success marker:\n${result.output}`,
	);

	console.log(`Feature integration route-mount test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
