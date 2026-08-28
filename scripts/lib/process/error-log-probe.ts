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

/** Long enough for a pino transport worker to write and flush before the process ends. */
const FLUSH_MS = 1200;

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

setTimeout(() => {
	exit(0);
}, FLUSH_MS);
