/**
 * Smoke test caching system for spernakit.
 *
 * Provides fast change detection to skip unchanged QC steps by tracking
 * file hashes and execution results.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import type {
	CacheCheckResult,
	CacheStatus,
	HashContext,
	SmokeCache,
	SmokeCacheDiagnostics,
} from './lib/smoke-cache/types.ts';

import { collectDependencyFiles, collectDirectories, hashFile } from './lib/smoke-cache/collect.ts';
import {
	isCacheableStep,
	STEP_DEPENDENCIES,
	UNCACHEABLE_STEPS,
} from './lib/smoke-cache/dependencies.ts';
import { MAX_HASH_CONCURRENCY, scheduleHash } from './lib/smoke-cache/hash-scheduler.ts';

export type { CacheStatus, SmokeCacheDiagnostics } from './lib/smoke-cache/types.ts';

// ===== TYPE DEFINITIONS =====

// ===== CONSTANTS =====

const CACHE_VERSION = 1;
const CACHE_FILENAME = 'smoke-cache.json';

// ===== CORE FUNCTIONS =====

function getCachePath(projectRoot: string): string {
	return join(projectRoot, 'scripts', CACHE_FILENAME);
}

function loadCache(projectRoot: string, diagnostics?: SmokeCacheDiagnostics): SmokeCache {
	if (diagnostics) diagnostics.cacheLoads++;
	const cachePath = getCachePath(projectRoot);

	if (!existsSync(cachePath)) {
		return {
			lastRun: '',
			steps: {},
			version: CACHE_VERSION,
		};
	}

	try {
		const raw = readFileSync(cachePath, 'utf-8');
		const cache = JSON.parse(raw) as SmokeCache;

		if (cache.version !== CACHE_VERSION) {
			return { lastRun: '', steps: {}, version: CACHE_VERSION };
		}

		return cache;
	} catch {
		return { lastRun: '', steps: {}, version: CACHE_VERSION };
	}
}

function saveCache(projectRoot: string, cache: SmokeCache): void {
	const cachePath = getCachePath(projectRoot);
	const logsDir = dirname(cachePath);

	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}

	writeFileSync(cachePath, JSON.stringify(cache, null, '\t'), 'utf-8');
}

function createHashContext(diagnostics?: SmokeCacheDiagnostics): HashContext {
	return {
		activeHashes: 0,
		collections: new Map(),
		...(diagnostics ? { diagnostics } : {}),
		directories: new Map(),
		fileHashes: new Map(),
		hashQueue: [],
	};
}

function dependencyKey(kind: 'directories' | 'files', value: unknown): string {
	return `${kind}:${JSON.stringify(value)}`;
}

async function computeStepHash(
	projectRoot: string,
	stepName: string,
	context: HashContext,
): Promise<string> {
	const deps = STEP_DEPENDENCIES[stepName];

	if (!deps) {
		throw new Error(`No cache dependency map exists for step '${stepName}'.`);
	}

	const filesKey = dependencyKey('files', {
		collector: deps.collector,
		dot: deps.dot,
		excludes: deps.excludes,
		globs: deps.globs,
	});
	let filesPromise = context.collections.get(filesKey);
	if (!filesPromise) {
		filesPromise = collectDependencyFiles(projectRoot, deps);
		context.collections.set(filesKey, filesPromise);
	}
	const files = await filesPromise;

	let directories: string[] = [];
	if (deps.directoryGlobs) {
		const directoriesKey = dependencyKey('directories', {
			excludes: deps.excludes,
			globs: deps.directoryGlobs,
		});
		let directoriesPromise = context.directories.get(directoriesKey);
		if (!directoriesPromise) {
			directoriesPromise = collectDirectories(
				projectRoot,
				deps.directoryGlobs,
				deps.excludes,
			);
			context.directories.set(directoriesKey, directoriesPromise);
		}
		directories = await directoriesPromise;
	}

	const fileHashes: string[] = [];

	for (let i = 0; i < files.length; i += MAX_HASH_CONCURRENCY) {
		const batch = files.slice(i, i + MAX_HASH_CONCURRENCY);
		const batchHashes = await Promise.all(
			batch.map((file) => {
				let hashPromise = context.fileHashes.get(file);
				if (!hashPromise) {
					if (context.diagnostics) {
						const previous = context.diagnostics.fileReads.get(file) ?? 0;
						context.diagnostics.fileReads.set(file, previous + 1);
					}
					hashPromise = scheduleHash(context, () => hashFile(projectRoot, file));
					context.fileHashes.set(file, hashPromise);
				}
				return hashPromise;
			}),
		);
		fileHashes.push(...batchHashes);
	}

	const fileEntries = files.map((f, i) => `file:${f}:${fileHashes[i]}`);
	const directoryEntries = directories.map((d) => `dir:${d}:present`);
	const combined = [...fileEntries, ...directoryEntries].join('\n');

	return Bun.hash(combined).toString(16);
}

async function outputsExist(projectRoot: string, stepName: string): Promise<boolean> {
	const deps = STEP_DEPENDENCIES[stepName];

	if (!deps?.outputs) {
		return true;
	}

	for (const output of deps.outputs) {
		const outputPath = join(projectRoot, output);
		if (!existsSync(outputPath)) {
			return false;
		}

		const glob = new Bun.Glob('**/*');
		let hasFiles = false;
		for await (const _ of glob.scan({ cwd: outputPath, onlyFiles: true })) {
			hasFiles = true;
			break;
		}

		if (!hasFiles) {
			return false;
		}
	}

	return true;
}

// ===== PUBLIC API =====

export async function canSkipStep(
	projectRoot: string,
	stepName: string,
): Promise<CacheCheckResult> {
	return checkStepAgainstCache(
		projectRoot,
		stepName,
		loadCache(projectRoot),
		createHashContext(),
	);
}

async function checkStepAgainstCache(
	projectRoot: string,
	stepName: string,
	cache: SmokeCache,
	context: HashContext,
): Promise<CacheCheckResult> {
	if (!isCacheableStep(stepName)) {
		const reason = UNCACHEABLE_STEPS.has(stepName)
			? 'Intentionally uncacheable'
			: 'No dependency map; step is uncacheable';
		return { reason, skip: false };
	}

	const cached = cache.steps[stepName];

	if (!cached) {
		return { reason: 'No cache entry', skip: false };
	}

	if (cached.result === 'fail') {
		return { reason: 'Previous run failed', skip: false };
	}

	if (!(await outputsExist(projectRoot, stepName))) {
		return { reason: 'Outputs missing', skip: false };
	}

	const currentHash = await computeStepHash(projectRoot, stepName, context);

	if (currentHash !== cached.hash) {
		return { reason: 'Files changed', skip: false };
	}

	return {
		reason: `Unchanged since ${cached.lastRun} (${cached.duration}ms)`,
		skip: true,
	};
}

export async function recordStepResult(
	projectRoot: string,
	stepName: string,
	result: 'fail' | 'pass',
	duration: number,
): Promise<void> {
	if (!isCacheableStep(stepName)) return;

	const cache = loadCache(projectRoot);
	const hash = await computeStepHash(projectRoot, stepName, createHashContext());

	cache.steps[stepName] = {
		duration,
		hash,
		lastRun: new Date().toISOString(),
		result,
	};

	cache.lastRun = new Date().toISOString();

	saveCache(projectRoot, cache);
}

export async function getCacheStatus(
	projectRoot: string,
	steps: string[],
	diagnostics?: SmokeCacheDiagnostics,
): Promise<CacheStatus[]> {
	const cache = loadCache(projectRoot, diagnostics);
	const context = createHashContext(diagnostics);
	const statuses: (CacheStatus | undefined)[] = new Array(steps.length);
	let nextIndex = 0;
	const workerCount = Math.min(8, steps.length);
	const workers = Array.from({ length: workerCount }, async () => {
		while (nextIndex < steps.length) {
			const index = nextIndex++;
			const step = steps[index];
			if (step === undefined) continue;
			const { reason, skip } = await checkStepAgainstCache(projectRoot, step, cache, context);
			const cached = cache.steps[step];
			statuses[index] = {
				cacheable: isCacheableStep(step),
				cached: skip,
				lastResult: cached?.result,
				lastRun: cached?.lastRun,
				reason,
				step,
			};
		}
	});
	await Promise.all(workers);

	return statuses.map((status, index) => {
		if (!status) throw new Error(`Cache status worker omitted step at index ${String(index)}.`);
		return status;
	});
}
