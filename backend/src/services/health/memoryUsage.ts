/**
 * The memory reading the health check compares against its thresholds.
 *
 * The check used to divide heapUsed by heapTotal. Bun reports heapTotal as the heap it has
 * currently committed, a working set it grows lazily, not a ceiling the process is running out of,
 * so heapUsed routinely comes back larger than heapTotal and the ratio means nothing. The check
 * treated that as unusable, reported 0, and answered healthy every time, which left both memory
 * thresholds in Settings unable to fire on the only runtime the template runs on.
 *
 * Resident set against the memory the process is actually allowed is the number that decides
 * whether it survives: it is what a container limit is enforced against and what the OOM killer
 * reads. It is also the same measurement on every runtime, so the check no longer needs to know
 * which one it is on.
 *
 * @module memoryUsage
 */

import type { HealthStatus } from 'spernakit-shared';

import { readFileSync } from 'node:fs';
import { totalmem } from 'node:os';

interface MemoryLimit {
	bytes: number;
	source: MemoryLimitSource;
}

interface MemoryThresholds {
	memoryHeapDegradedThreshold: number;
	memoryHeapUnhealthyThreshold: number;
}

interface MemoryUsage {
	limitBytes: number;
	limitSource: MemoryLimitSource;
	ratio: number;
	usedBytes: number;
}

type MemoryLimitSource = 'cgroup' | 'system';

/**
 * cgroup v2 first, then v1. Both are absent outside Linux, and reading a missing file is how that
 * is detected rather than sniffing the platform, so a Linux host with no cgroup mounted and a
 * Windows or macOS host take the same path.
 */
const CGROUP_LIMIT_FILES = [
	'/sys/fs/cgroup/memory.max',
	'/sys/fs/cgroup/memory/memory.limit_in_bytes',
];

/**
 * Read the container memory limit this process runs under, if it has one.
 *
 * cgroup v2 writes the literal `max` when there is no limit. v1 has no such word and writes a
 * sentinel close to the largest number the kernel can hold instead, which is why the caller only
 * accepts a value below the host total rather than trusting whatever is in the file.
 *
 * @returns The limit in bytes, or null when there is no usable one.
 */
function readCgroupLimit(): null | number {
	for (const file of CGROUP_LIMIT_FILES) {
		let raw: string;
		try {
			raw = readFileSync(file, 'utf-8').trim();
		} catch {
			continue;
		}
		if (raw === 'max') return null;
		const value = Number.parseInt(raw, 10);
		if (Number.isFinite(value) && value > 0) return value;
	}
	return null;
}

/**
 * Resolve the memory ceiling to measure against.
 *
 * A container limit wins when it is lower than the host total, which is both how a real limit
 * presents itself and how the v1 unlimited sentinel is rejected.
 *
 * @returns The ceiling in bytes and where it came from.
 */
function getMemoryLimit(): MemoryLimit {
	const systemBytes = totalmem();
	const cgroupBytes = readCgroupLimit();
	if (cgroupBytes !== null && cgroupBytes < systemBytes) {
		return { bytes: cgroupBytes, source: 'cgroup' };
	}
	return { bytes: systemBytes, source: 'system' };
}

/**
 * Measure how much of its available memory the process is using.
 *
 * @param rssBytes - Resident set size, taken from the caller so the check reports the same reading
 *   it measured with.
 * @returns The reading, including the ceiling it was taken against.
 */
function getMemoryUsage(rssBytes: number): MemoryUsage {
	const limit = getMemoryLimit();
	return {
		limitBytes: limit.bytes,
		limitSource: limit.source,
		ratio: limit.bytes > 0 ? rssBytes / limit.bytes : 0,
		usedBytes: rssBytes,
	};
}

/**
 * Decide the memory status for a usage ratio.
 *
 * The two threshold settings keep their original `memoryHeap...` names. They are what an operator
 * has already tuned and what every derived app has stored, and renaming them would quietly reset
 * those stored values to the defaults on the next read.
 *
 * @param ratio - Memory in use as a fraction of the limit.
 * @param thresholds - The configured degraded and unhealthy ratios.
 * @returns The status the ratio earns.
 */
function memoryStatusFor(ratio: number, thresholds: MemoryThresholds): HealthStatus {
	if (ratio > thresholds.memoryHeapUnhealthyThreshold) return 'unhealthy';
	if (ratio > thresholds.memoryHeapDegradedThreshold) return 'degraded';
	return 'healthy';
}

export { getMemoryUsage, memoryStatusFor };
export type { MemoryUsage };
