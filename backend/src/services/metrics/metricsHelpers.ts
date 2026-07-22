import { statfsSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getConfig } from '../../config/configLoader.ts';
import { logger } from '../../utils/logger.ts';

const __metricsDir = dirname(fileURLToPath(import.meta.url));
const metricsProjectRoot = resolve(__metricsDir, '..', '..', '..', '..');

// ---------------------------------------------------------------------------
// CPU measurement (delta-based)
// ---------------------------------------------------------------------------

interface CpuSnapshot {
	idle: number;
	tick: number;
	timestamp: number;
}

let lastCpuSnapshot: CpuSnapshot | null = null;
let cachedCpuUsage = 0;

/** Minimum time (ms) between CPU readings for accurate delta. */
const CPU_MIN_DELTA_MS = 1000;

/**
 * Calculate CPU usage as a percentage (0-100) based on delta between snapshots.
 * Uses a delta-based comparison for accurate current usage measurement.
 *
 * @returns CPU usage percentage since last reading
 */
function getCpuUsage(): number {
	const cores = cpus();
	let totalIdle = 0;
	let totalTick = 0;

	for (const core of cores) {
		const { idle, irq, nice, sys, user } = core.times;
		totalTick += user + nice + sys + idle + irq;
		totalIdle += idle;
	}

	const now = Date.now();

	if (lastCpuSnapshot) {
		const deltaTime = now - lastCpuSnapshot.timestamp;

		if (deltaTime >= CPU_MIN_DELTA_MS) {
			const deltaTick = totalTick - lastCpuSnapshot.tick;
			const deltaIdle = totalIdle - lastCpuSnapshot.idle;

			if (deltaTick > 0) {
				cachedCpuUsage = Math.round(((deltaTick - deltaIdle) / deltaTick) * 1000) / 10;
			}

			lastCpuSnapshot = { idle: totalIdle, tick: totalTick, timestamp: now };
		}

		return cachedCpuUsage;
	}

	lastCpuSnapshot = { idle: totalIdle, tick: totalTick, timestamp: now };
	return 0;
}

// ---------------------------------------------------------------------------
// Disk usage
// ---------------------------------------------------------------------------

/**
 * Get disk usage percentage (0-100) for the data volume.
 *
 * @returns Disk usage percentage or null on error
 */
function getDiskUsagePercent(): null | number {
	try {
		const config = getConfig();
		const dbUrl = config.database.url;
		const dbPath = dbUrl.startsWith('file:') ? dbUrl.substring(5) : dbUrl;
		const absoluteDbPath = resolve(
			metricsProjectRoot,
			dbPath.startsWith('./') ? dbPath.substring(2) : dbPath
		);
		const dataDir = dirname(absoluteDbPath);
		const stats = statfsSync(dataDir);
		const total = stats.blocks * stats.bsize;
		const free = stats.bfree * stats.bsize;
		if (total === 0) return null;
		return Math.round(((total - free) / total) * 1000) / 10;
	} catch (err) {
		logger.warn({ err }, 'Failed to read disk usage - statfsSync failed on data directory');
		return null;
	}
}

// ---------------------------------------------------------------------------
// Event loop latency measurement
// ---------------------------------------------------------------------------

let lastEventLoopLatencyMs: null | number = null;
let eventLoopTimerHandle: null | ReturnType<typeof setTimeout> = null;

/**
 * Measure event loop latency by scheduling a zero-delay timer and recording
 * how long the callback actually takes to fire.
 */
function measureEventLoopLatency(): void {
	const INTERVAL_MS = 1000;
	const scheduled = performance.now();
	eventLoopTimerHandle = setTimeout(() => {
		lastEventLoopLatencyMs =
			Math.round((performance.now() - scheduled - INTERVAL_MS) * 100) / 100;
		measureEventLoopLatency();
	}, INTERVAL_MS);
}

/**
 * Stop the event loop latency measurement timer.
 */
function stopEventLoopLatencyTimer(): void {
	if (eventLoopTimerHandle) {
		clearTimeout(eventLoopTimerHandle);
		eventLoopTimerHandle = null;
	}
}

/**
 * Get the last measured event loop latency in milliseconds.
 *
 * @returns Latency in ms or null if not yet measured
 */
function getEventLoopLatency(): null | number {
	return lastEventLoopLatencyMs;
}

export {
	getCpuUsage,
	getDiskUsagePercent,
	getEventLoopLatency,
	measureEventLoopLatency,
	stopEventLoopLatencyTimer,
};
