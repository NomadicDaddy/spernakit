/**
 * Smoke test caching system for spernakit.
 *
 * Provides fast change detection to skip unchanged QC steps by tracking
 * file hashes and execution results.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { collectDependencyFiles, collectDirectories, hashFile } from './lib/smoke-cache/collect.ts';
import { STEP_DEPENDENCIES } from './lib/smoke-cache/dependencies.ts';

// ===== TYPE DEFINITIONS =====

interface StepCacheEntry {
	duration: number;
	hash: string;
	lastRun: string;
	result: 'fail' | 'pass';
}

interface SmokeCache {
	lastRun: string;
	steps: Record<string, StepCacheEntry>;
	version: number;
}

interface CacheCheckResult {
	reason: string;
	skip: boolean;
}

interface CacheStatus {
	cached: boolean;
	lastResult: 'fail' | 'pass' | undefined;
	lastRun: string | undefined;
	reason: string;
	step: string;
}

// ===== CONSTANTS =====

const CACHE_VERSION = 1;
const CACHE_FILENAME = 'smoke-cache.json';

// ===== CORE FUNCTIONS =====

function getCachePath(projectRoot: string): string {
	return join(projectRoot, 'scripts', CACHE_FILENAME);
}

function loadCache(projectRoot: string): SmokeCache {
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

async function computeStepHash(projectRoot: string, stepName: string): Promise<string> {
	const deps = STEP_DEPENDENCIES[stepName];

	if (!deps) {
		return Date.now().toString();
	}

	const files = await collectDependencyFiles(projectRoot, deps);
	const directories = deps.directoryGlobs
		? await collectDirectories(projectRoot, deps.directoryGlobs, deps.excludes)
		: [];

	const BATCH_SIZE = 100;
	const fileHashes: string[] = [];

	for (let i = 0; i < files.length; i += BATCH_SIZE) {
		const batch = files.slice(i, i + BATCH_SIZE);
		const batchHashes = await Promise.all(batch.map((f) => hashFile(projectRoot, f)));
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
	stepName: string
): Promise<CacheCheckResult> {
	const cache = loadCache(projectRoot);
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

	const currentHash = await computeStepHash(projectRoot, stepName);

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
	duration: number
): Promise<void> {
	const cache = loadCache(projectRoot);
	const hash = await computeStepHash(projectRoot, stepName);

	cache.steps[stepName] = {
		duration,
		hash,
		lastRun: new Date().toISOString(),
		result,
	};

	cache.lastRun = new Date().toISOString();

	saveCache(projectRoot, cache);
}

export async function getCacheStatus(projectRoot: string, steps: string[]): Promise<CacheStatus[]> {
	const statuses: CacheStatus[] = [];

	for (const step of steps) {
		const { reason, skip } = await canSkipStep(projectRoot, step);
		const cache = loadCache(projectRoot);
		const cached = cache.steps[step];

		statuses.push({
			cached: skip,
			lastResult: cached?.result,
			lastRun: cached?.lastRun,
			reason,
			step,
		});
	}

	return statuses;
}
