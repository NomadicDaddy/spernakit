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
import { configLogger } from '../../../backend/src/config/configLogger.ts';
import { createLoggerForConfig } from '../../../backend/src/utils/logger.ts';
import { registerLogSecretValues } from '../../../backend/src/utils/logSecretRedaction.ts';

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

const configuredSecret = `${marker}-configured\nsecret/%`;
const escapedSecret = JSON.stringify(configuredSecret).slice(1, -1);
const encodedSecret = encodeURIComponent(configuredSecret);
const bearerToken = `${marker}.bearer-token.signature`;
const assignmentSecret = `${marker}-assignment-secret`;
const splitSecret = `${marker}-split-file-value`;
const shortSecret = 'q7!';

const base = initializeConfig();

function configForMode(): AppConfig {
	if (mode === 'dev') {
		return {
			...base,
			security: { ...base.security, cookieSecret: configuredSecret },
			server: { ...base.server, nodeEnv: 'development' },
		};
	}

	const file =
		mode === 'prod-file'
			? { enabled: true, maxFiles: 2, maxSize: '10M', path: rollPath }
			: { ...base.logging.file, enabled: false };

	return {
		...base,
		logging: { ...base.logging, file },
		security: { ...base.security, cookieSecret: configuredSecret },
		server: { ...base.server, nodeEnv: 'production' },
	};
}

registerLogSecretValues(
	{ provider: { opaqueValues: [shortSecret, splitSecret] } },
	{ includeEveryString: true },
);
const logger = createLoggerForConfig(configForMode());

const cause = new Error(`${marker}-error-cause ${configuredSecret}`);
cause.stack = `Error: ${marker}-error-cause ${configuredSecret}\n    at probe-cause`;
const loggedError = new Error(`${marker}-error-message ${configuredSecret}`, { cause });
loggedError.stack = `Error: ${marker}-error-stack ${configuredSecret}\n    at probe-error`;

logger.info({ category: 'probe' }, `${marker} info entry`);
configLogger.info(
	{ bootstrapText: `${marker}-bootstrap ${configuredSecret}` },
	`${marker} bootstrap entry ${configuredSecret}`,
);
logger.error(
	{
		array: [`${marker}-array ${configuredSecret}`],
		authorizationText: `Bearer ${bearerToken}`,
		bearerLabel: `${marker}-bearer`,
		category: 'probe',
		err: loggedError,
		escapedText: `${marker}-escaped ${escapedSecret}`,
		genericObject: { nested: `${marker}-generic ${configuredSecret}` },
		password: `${marker}-PLAINTEXT`,
		shortText: `${marker}-short ${shortSecret}`,
		splitText: `${marker}-split ${splitSecret}`,
		tokenText: `${marker}-assignment token=${assignmentSecret}`,
		uriText: `${marker}-uri ${encodedSecret}`,
	},
	`${marker} error entry ${configuredSecret}`,
);
logger.error({ category: 'probe' }, `${marker}-format %s`, configuredSecret);
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
