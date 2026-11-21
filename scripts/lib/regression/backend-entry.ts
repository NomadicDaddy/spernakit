#!/usr/bin/env bun
/**
 * Start the backend for one regression-suite case, reading its config from the run's own directory.
 *
 * Importing app.ts does not start it, because app.ts starts only when it is the main module. This
 * entry then starts it with the run's config directory, so the instance never reads the
 * repository's config/ or its secrets. It is only ever launched by instance.ts, never by people.
 *
 * Once the server is listening it writes `{ pid, port }` to the ready file it was given, so
 * instance.ts knows that this process, and not some other listener, holds the port. A failed bind
 * exits inside startBackend and never writes the file.
 */
import { renameSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';

import { startBackend } from '../../../backend/src/app.ts';

const [configDir, readyFile] = process.argv.slice(2);
if (
	configDir === undefined ||
	readyFile === undefined ||
	!isAbsolute(configDir) ||
	!isAbsolute(readyFile)
) {
	console.error(
		'[FAIL] backend-entry: pass the config directory and ready file as absolute paths.',
	);
	process.exit(2);
}
const port = await startBackend(configDir);
// Written whole under another name and renamed, so a reader never sees half of it.
writeFileSync(`${readyFile}.tmp`, JSON.stringify({ pid: process.pid, port }));
renameSync(`${readyFile}.tmp`, readyFile);
