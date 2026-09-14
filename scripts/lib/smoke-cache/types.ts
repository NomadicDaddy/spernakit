/**
 * Shared shape for a smoke cache step's dependency declaration.
 *
 * Split out from `dependencies.ts` so the step maps and the collector can both depend on the type
 * without importing each other.
 */

export interface StepDependencies {
	collector?: 'prettier';
	directoryGlobs?: string[];
	/**
	 * Scan hidden directories. Bun.Glob skips anything under a dot-segment unless this is set, so a
	 * step whose inputs live in `.aidd/` collects an empty file list — and therefore a constant hash
	 * — without it. Only set it for globs rooted at a specific hidden directory: enabling it for a
	 * broad `**` scan also walks node_modules' dotfiles and is roughly ten times slower.
	 */
	dot?: boolean;
	excludes: string[];
	globs: string[];
	outputs?: string[];
}

export interface StepCacheEntry {
	duration: number;
	hash: string;
	lastRun: string;
	result: 'fail' | 'pass';
}

export interface SmokeCache {
	lastRun: string;
	steps: Record<string, StepCacheEntry>;
	version: number;
}

export interface CacheCheckResult {
	reason: string;
	skip: boolean;
}

export interface CacheStatus {
	cacheable: boolean;
	cached: boolean;
	lastResult: 'fail' | 'pass' | undefined;
	lastRun: string | undefined;
	reason: string;
	step: string;
}

export interface SmokeCacheDiagnostics {
	cacheLoads: number;
	fileReads: Map<string, number>;
	peakHashConcurrency: number;
}

export interface HashContext {
	activeHashes: number;
	collections: Map<string, Promise<string[]>>;
	diagnostics?: SmokeCacheDiagnostics;
	directories: Map<string, Promise<string[]>>;
	fileHashes: Map<string, Promise<string>>;
	hashQueue: (() => void)[];
}
