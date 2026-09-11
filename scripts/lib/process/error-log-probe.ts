#!/usr/bin/env bun
/**
 * Fixture for scripts/test-error-log-wiring.ts. Not part of the application.
 *
 * Runs as the child of a spawn wired the way start.ts and dev-with-logs.ts wire a server: stdout
 * to `logs/<name>.log`, stderr to `logs/<name>.error.log`. It writes one info entry, one error
 * entry carrying a secret-shaped field, and one raw stderr line, then exits once the pino transport
 * threads have had time to flush. The gate reads both files back and asserts where each landed.
 *
 * The mode argument selects the logger configuration to exercise, so one gate can cover a mode the
 * process running it is not itself configured for.
 */
import { argv, exit, stderr } from 'node:process';

import type { AppConfig } from '../../../backend/src/config/configSchema.ts';

import { initializeConfig } from '../../../backend/src/config/configLoader.ts';
import { createLoggerForConfig } from '../../../backend/src/utils/logger.ts';

/**
 * How long the probe waits for the transport to drain before it gives up and reports a stall.
 *
 * It is a stall detector, not a budget: the flush callback below ends the process as soon as the
 * worker has taken everything, so a healthy run never spends this.
 */
const FLUSH_DEADLINE_MS = 30_000;

/** Time for the worker's own sinks to reach disk once the stream has drained into it. */
const SETTLE_MS = 250;

const mode = argv[2] ?? 'dev';
const marker = argv[3] ?? 'PROBE';
const rollPath = argv[4] ?? '';

const base = initializeConfig();

function configForMode(): AppConfig {
	if (mode === 'dev') {
		return { ...base, server: { ...base.server, nodeEnv: 'development' } };
	}

	const file =
		mode === 'prod-file'
			? { enabled: true, maxFiles: 2, maxSize: '10M', path: rollPath }
			: { ...base.logging.file, enabled: false };

	return {
		...base,
		logging: { ...base.logging, file },
		server: { ...base.server, nodeEnv: 'production' },
	};
}

const logger = createLoggerForConfig(configForMode());

logger.info({ category: 'probe' }, `${marker} info entry`);
logger.error({ category: 'probe', password: `${marker}-PLAINTEXT` }, `${marker} error entry`);
stderr.write(`${marker} raw stderr line\n`);

/**
 * Wait for the transport to drain rather than for a fixed number of milliseconds.
 *
 * A pino transport writes from a worker thread, and the worker has to load its target modules
 * before it can write anything at all. On a cold module cache, which is what the first run after a
 * package install has, that start costs more than every write in this probe put together, and a
 * probe that exits on a timer exits with the whole batch still queued. Nothing reached either log
 * and nothing reached the rotated file, so the gate read a cold cache as a wiring regression, in
 * the one mode whose targets include a third-party transport. Flushing waits for the worker
 * instead of racing it.
 */
const stalled = setTimeout(() => {
	console.error(`${marker} transport did not drain`);
	exit(1);
}, FLUSH_DEADLINE_MS);

logger.flush(() => {
	clearTimeout(stalled);
	setTimeout(() => {
		exit(0);
	}, SETTLE_MS);
});
