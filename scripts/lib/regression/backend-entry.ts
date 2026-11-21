#!/usr/bin/env bun
/**
 * Start the backend for one regression-suite case, reading its config from the run's own directory.
 *
 * Importing app.ts does not start it, because app.ts starts only when it is the main module. This
 * entry then starts it with the run's config directory, so the instance never reads the
 * repository's config/ or its secrets. It is only ever launched by instance.ts, never by people.
 */
import { isAbsolute } from 'node:path';

import { startBackend } from '../../../backend/src/app.ts';

const configDir = process.argv[2];
if (configDir === undefined || !isAbsolute(configDir)) {
	console.error('[FAIL] backend-entry: pass the run config directory as an absolute path.');
	process.exit(2);
}
await startBackend(configDir);
