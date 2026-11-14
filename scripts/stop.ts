/**
 * Stop Script
 *
 * Stops running spernakit processes by:
 * 1. Reading PID files from logs/ directory (written by start.ts and dev-with-logs.ts)
 * 2. Falling back to port-based detection if PID files are missing. An HTTP probe checks
 *    for listeners the OS port table misses; an answering port with no discoverable PID
 *    makes this command fail explicitly. `dev:quick` and the bare workspace dev scripts
 *    write no PID files and rely on this fallback.
 * 3. Running docker-compose down if Docker containers are running
 *
 * Usage:
 *   bun scripts/stop.ts              # Stop both backend and frontend
 *   bun scripts/stop.ts --backend    # Stop backend only
 *   bun scripts/stop.ts --frontend   # Stop frontend only
 *   bun scripts/stop.ts --from-start # Clearing the way for a launch (start.ts, dev,
 *                                    # dev:quick): clean stale PIDs without exiting
 *                                    # non-zero, since a stale PID with nothing to kill
 *                                    # is the normal recoverable case before a start
 */
import { execSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { findPidOnPortUnix, findPidOnPortWindows } from './lib/process/ports.ts';
import { stopService } from './lib/process/stop-service.ts';
import { loadJsonConfig } from './load-json-config.ts';

const repoRoot = path.resolve(import.meta.dirname, '..');
const logsDir = path.join(repoRoot, 'logs');

// Parse arguments
const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		backend: { default: false, type: 'boolean' },
		'from-start': { default: false, type: 'boolean' },
		frontend: { default: false, type: 'boolean' },
	},
	strict: true,
});

// If neither flag is set, stop both
const stopBackend = values.backend || (!values.backend && !values.frontend);
const stopFrontend = values.frontend || (!values.backend && !values.frontend);

/**
 * Check if Docker containers are running for this app.
 */
function isDockerRunning(): boolean {
	try {
		const result = spawnSync('docker', ['compose', 'ps', '-q'], {
			cwd: repoRoot,
			encoding: 'utf8',
			stdio: ['pipe', 'pipe', 'pipe'],
		});

		if (result.status !== 0) {
			return false;
		}

		const output = result.stdout?.trim() || '';
		return output.length > 0;
	} catch {
		return false;
	}
}

/**
 * Stop Docker containers.
 */
function stopDocker(): void {
	console.log('🐳 Stopping Docker containers...');
	try {
		execSync('docker compose down', {
			cwd: repoRoot,
			stdio: 'inherit',
		});
		console.log('✅ Docker containers stopped.');
	} catch (err) {
		console.error('❌ Failed to stop Docker containers:', err);
		process.exit(1);
	}
}

// Main execution
const { appSlug, config } = loadJsonConfig(repoRoot);
const frontendPort = config.server?.frontendPort ?? 3330;
const backendPort = config.server?.backendPort ?? 3331;

const scope = stopBackend && stopFrontend ? '' : stopBackend ? ' (backend)' : ' (frontend)';
console.log(`\n🛑 Stopping ${appSlug}${scope}...`);
console.log(`   Frontend port: ${frontendPort}`);
console.log(`   Backend port: ${backendPort}\n`);

if (stopBackend && stopFrontend && isDockerRunning()) {
	stopDocker();
} else {
	console.log('🔍 Looking for processes...');

	let killedAny = false;
	let sawStalePid = false;
	let failed = false;
	let unresolvedListener = false;
	const findPidOnPort = process.platform === 'win32' ? findPidOnPortWindows : findPidOnPortUnix;

	if (stopFrontend) {
		const result = await stopService({
			findPidOnPort,
			logsDir,
			name: 'frontend',
			port: frontendPort,
		});
		killedAny ||= result.killed;
		sawStalePid ||= result.stalePid;
		failed ||= result.failed;
		unresolvedListener ||= result.unresolvedListener;
	}

	if (stopBackend) {
		const result = await stopService({
			findPidOnPort,
			logsDir,
			name: 'backend',
			port: backendPort,
		});
		killedAny ||= result.killed;
		sawStalePid ||= result.stalePid;
		failed ||= result.failed;
		unresolvedListener ||= result.unresolvedListener;
	}

	if (unresolvedListener) {
		console.error(
			'❌ A port still answers HTTP; its listener could not be resolved or stopped.',
		);
	} else if (failed) {
		console.error('❌ Could not stop every detected process.');
	} else if (killedAny) {
		console.log('✅ Processes stopped.');
	} else {
		const portList = [
			...(stopFrontend ? [frontendPort] : []),
			...(stopBackend ? [backendPort] : []),
		].join(' or ');
		console.log(`ℹ️  No running processes found on ports ${portList}`);
	}

	// When invoked directly, a stale PID with nothing to kill means a service
	// crashed silently — surface it loudly with a non-zero exit. When clearing the
	// way for a launch (--from-start, passed by start.ts, dev and dev:quick), that
	// same condition is the normal recoverable case: just clean up and let the
	// launch proceed.
	if (sawStalePid && !killedAny && !values['from-start']) {
		console.log(
			'ℹ Hint: backend may have crashed mid-session — check logs/backend.log and logs/backend.error.log',
		);
		process.exit(1);
	}
	if (unresolvedListener || failed) process.exit(1);
}
