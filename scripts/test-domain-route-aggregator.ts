#!/usr/bin/env bun
/**
 * Gate: the template mounts its route groups through one typed aggregator, backend/src/routes/
 * domain.ts, and an application that adds its own groups the documented way keeps full type
 * inference in `ReturnType<typeof createApiApp>` (`.aidd/features/typed-domain-route-aggregator`).
 *
 * In this checkout (compile time, through scripts/tsconfig.json): DomainRoutes is inferred, not
 * any, and carries a template route.
 *
 * In an app initialized from HEAD with scripts/init.ts --no-install:
 *  1. The scaffold ships backend/src/routes/domain.ts, and its create-api-app.ts imports it and
 *     mounts it with exactly one .use() and imports no route group itself. No .templateoverrides
 *     entry names either file.
 *  2. With DEVELOPMENT.md's extension applied (a twelve-group app aggregator in routes/app.ts,
 *     mounted with one more .use() at the end of the domainRoutes chain), the backend typechecks
 *     with no TS2589 and a probe over `ReturnType<typeof createApiApp>` sees both a template route
 *     and the app's routes with their exact response types. Two `@ts-expect-error` lines in the
 *     probe are the control: if the types were any or missing, the typecheck would fail.
 */
import {
	copyFileSync,
	existsSync,
	lstatSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	symlinkSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import type { DomainRoutes } from '../backend/src/routes/domain.ts';

import { appRoutesSource, extendDomainSource, probeSource } from './lib/domain-route-fixture.ts';

type IsAny<T> = 0 extends 1 & T ? true : false;
type Expect<T extends true> = T;
export type DomainRoutesNotAny = Expect<
	IsAny<DomainRoutes['~Routes']> extends false ? true : false
>;
export type DomainRoutesHasTasks = Expect<
	'tasks' extends keyof DomainRoutes['~Routes'] ? true : false
>;

const repoRoot = resolve(import.meta.dir, '..');
const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

function initProbeApp(workDir: string): null | string {
	const target = join(workDir, 'probe-app');
	const manifestCopy = join(workDir, 'spernakit.psd1');
	const localManifest = join(repoRoot, 'spernakit.psd1');
	copyFileSync(
		existsSync(localManifest) ? localManifest : `${localManifest}.example`,
		manifestCopy,
	);
	const init = Bun.spawnSync(
		[
			'bun',
			'scripts/init.ts',
			'--application',
			'domain-route-probe',
			'--target',
			target,
			'--name',
			'Domain Route Probe',
			'--description',
			'throwaway domain route aggregator probe',
			'--no-install',
			'--manifest',
			manifestCopy,
		],
		{ cwd: repoRoot, stderr: 'pipe', stdout: 'pipe' },
	);
	if (init.exitCode === 0) return target;
	failures.push(`init from HEAD failed: ${init.stdout.toString()}${init.stderr.toString()}`);
	return null;
}

function checkScaffold(target: string): string | undefined {
	const domainPath = join(target, 'backend/src/routes/domain.ts');
	assert(existsSync(domainPath), '1: the scaffold should ship backend/src/routes/domain.ts');
	const createApiApp = readFileSync(join(target, 'backend/src/create-api-app.ts'), 'utf8');
	assert(
		createApiApp.includes("import { domainRoutes } from './routes/domain.ts';"),
		'1: create-api-app.ts should import domainRoutes from routes/domain.ts',
	);
	assert(
		(createApiApp.match(/\.use\(domainRoutes\)/g) ?? []).length === 1,
		'1: create-api-app.ts should mount domainRoutes exactly once',
	);
	const groupImports = createApiApp.match(/from '\.\/routes\/(?!domain\.ts')[^']+'/g) ?? [];
	assert(
		groupImports.length === 0,
		`1: create-api-app.ts should import no route group, found ${groupImports.join(', ')}`,
	);
	const overrides = join(target, '.templateoverrides');
	const overrideText = existsSync(overrides) ? readFileSync(overrides, 'utf8') : '';
	assert(
		!/create-api-app\.ts|routes\/domain\.ts/.test(overrideText),
		'1: no .templateoverrides entry should be needed for route mounting',
	);
	return existsSync(domainPath) ? readFileSync(domainPath, 'utf8') : undefined;
}

function typecheckExtended(target: string, domainSource: string): void {
	const extended = extendDomainSource(domainSource);
	assert(extended !== null, "2: the scaffold's domainRoutes chain should end at workspaceRoutes");
	if (extended === null) return;
	writeFileSync(join(target, 'backend/src/routes/domain.ts'), extended);
	writeFileSync(join(target, 'backend/src/routes/app.ts'), appRoutesSource());
	writeFileSync(join(target, 'backend/src/domain-route-probe.ts'), probeSource());
	// --no-install leaves no dependencies; lend the probe this checkout's, as junctions.
	for (const dir of ['node_modules', 'backend/node_modules']) {
		symlinkSync(join(repoRoot, dir), join(target, dir), 'junction');
	}
	const tsc = Bun.spawnSync(['bunx', 'tsc', '--noEmit', '-p', 'tsconfig.json'], {
		cwd: join(target, 'backend'),
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const output = tsc.stdout.toString() + tsc.stderr.toString();
	assert(
		tsc.exitCode === 0,
		`2: the extended backend should typecheck with the probe's assertions holding:\n${output}`,
	);
}

const WORK_PREFIX = 'spernakit-domain-routes-';
const BORROWED = ['probe-app/node_modules', 'probe-app/backend/node_modules'];
/** A leftover older than this cannot belong to a run still in progress. */
const STALE_MS = 60 * 60 * 1000;

/**
 * Remove a probe work directory. The borrowed junctions are unlinked first, so the recursive
 * delete can never reach this checkout's dependencies through them. Only a link is unlinked; a
 * real directory in its place keeps the tree from being deleted at all.
 */
function removeWorkDir(dir: string): void {
	for (const borrowed of BORROWED) {
		const link = join(dir, borrowed);
		if (existsSync(link) && lstatSync(link).isSymbolicLink()) unlinkSync(link);
	}
	if (BORROWED.some((borrowed) => existsSync(join(dir, borrowed)))) {
		console.warn(`domain route aggregator: links remain under ${dir}; remove it by hand`);
		return;
	}
	rmSync(dir, { force: true, maxRetries: 3, recursive: true, retryDelay: 200 });
}

// A killed run skips its finally and leaves its work directory, junctions included. Clear any
// such leftover first; recent ones are left alone in case another run is still using them.
for (const entry of readdirSync(tmpdir())) {
	const dir = join(tmpdir(), entry);
	if (entry.startsWith(WORK_PREFIX) && Date.now() - statSync(dir).mtimeMs > STALE_MS) {
		removeWorkDir(dir);
	}
}

const workDir = mkdtempSync(join(tmpdir(), WORK_PREFIX));
try {
	const target = initProbeApp(workDir);
	const domainSource = target === null ? undefined : checkScaffold(target);
	if (target !== null && domainSource !== undefined) typecheckExtended(target, domainSource);
} finally {
	removeWorkDir(workDir);
}

if (failures.length > 0) {
	console.error(`domain route aggregator: ${failures.length} failure(s)`);
	for (const failure of failures) console.error(`  - ${failure}`);
	process.exit(1);
}
console.log('domain route aggregator: all checks passed');
