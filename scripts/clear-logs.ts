#!/usr/bin/env bun
/**
 * Clear Logs Script
 *
 * Removes the files this repository's own runtime and runbook write into logs/, so the services
 * that smoke:dev, smoke:reset and smoke:screenshots are about to start write to a clean slate.
 * Anything else in logs/ is left where it is and named on the way out.
 *
 * It used to remove every *.log and *.pid, which made logs/ unsafe for anything but this
 * repository's own output. Operators running a long gate would redirect its transcript there, and
 * step 2 of reset and screenshots would unlink the target mid-run; on Windows the writer kept its
 * handle on the orphaned file, so the redirect went on succeeding while the transcript became
 * unrecoverable. Three of them lost a supertest log that way in a single afternoon.
 *
 * Usage:
 *   bun scripts/clear-logs.ts
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * The files the runtime writes. dev-with-logs.ts starts exactly two servers, backend and frontend,
 * and derives `<name>.log` and `<name>.error.log` from each; start.ts and stop.ts derive
 * `<name>.pid` from the same two. Rotation extends those stems rather than replacing them, so the
 * middle group admits a rotation infix (`backend-2026-08-26T17-40-00.log`, `backend.error.log`)
 * and the tail admits a generation index (`backend.log.1`).
 *
 * It is deliberately anchored rather than a prefix test: `backend.log.txt` is somebody's copy of a
 * log, not a log this script wrote, and it survives.
 */
const RUNTIME_FILE = /^(?:backend|frontend)(?:[.-].*)?\.(?:log|pid)(?:\.\d+)?$/;

const logsDir = path.resolve(import.meta.dirname, '..', 'logs');

/**
 * Every `logs/` file scripts/smoke.json redirects a step into. Reading the runbook rather than
 * hardcoding the crawltest names keeps this in step with an app that adds or renames a step.
 */
function declaredLogFiles(): Set<string> {
	const smokePath = path.resolve(import.meta.dirname, 'smoke.json');
	const declared = new Set<string>();
	if (!fs.existsSync(smokePath)) return declared;

	const collect = (node: unknown): void => {
		if (Array.isArray(node)) {
			for (const item of node) collect(item);
			return;
		}
		if (node === null || typeof node !== 'object') return;
		for (const [key, value] of Object.entries(node)) {
			if (key === 'logFile' && typeof value === 'string') {
				if (path.dirname(value) === 'logs') declared.add(path.basename(value));
				continue;
			}
			collect(value);
		}
	};

	try {
		collect(JSON.parse(fs.readFileSync(smokePath, 'utf8')));
	} catch {
		// A runbook this script cannot parse is the smoke runner's problem to report, not a reason
		// to fall back on deleting more than it owns.
	}
	return declared;
}

const declared = declaredLogFiles();

function isOwned(file: string): boolean {
	return declared.has(file) || RUNTIME_FILE.test(file);
}

if (!fs.existsSync(logsDir)) {
	console.log('   No logs/ directory found — nothing to clear.');
	process.exit(0);
}

let removed = 0;
const kept: string[] = [];

for (const file of fs.readdirSync(logsDir)) {
	if (file === '.gitkeep') continue;
	if (isOwned(file)) {
		fs.unlinkSync(path.join(logsDir, file));
		removed++;
	} else {
		kept.push(file);
	}
}

console.log(`   Cleared ${removed} log/pid file${removed === 1 ? '' : 's'} from logs/`);
if (kept.length > 0) {
	console.log(
		`   Left ${kept.length} file${kept.length === 1 ? '' : 's'} it does not own: ${kept.join(', ')}`,
	);
}
