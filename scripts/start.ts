#!/usr/bin/env bun
/**
 * Background Server Launcher
 *
 * Starts both backend and frontend servers as detached background processes.
 * Output is redirected to rotating log files in the /logs directory.
 * PID files are written for reliable process management by stop.ts.
 * Verifies processes are listening on their ports before reporting success.
 *
 * Usage:
 *   bun scripts/start.ts          # Start both services
 *   bun scripts/start.ts --check  # Run check-application before starting
 */
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { isProcessAlive, killProcessByPidFile, readPidFile } from './lib/process/pid-files.ts';
import { PORT_CHECK_TIMEOUT_MS, type PortWaitResult, waitForPort } from './lib/process/ports.ts';
import { spawnBackground } from './lib/process/spawn-background.ts';
import { loadJsonConfig } from './load-json-config.ts';

const rootDir = path.resolve(import.meta.dirname, '..');
const logsDir = path.join(rootDir, 'logs');

// Parse arguments
const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		check: { default: false, type: 'boolean' },
		preview: { default: false, type: 'boolean' },
	},
	strict: true,
});

// Ensure logs directory exists
if (!fs.existsSync(logsDir)) {
	fs.mkdirSync(logsDir, { recursive: true });
}

// Load config
const { appSlug, config } = loadJsonConfig(rootDir);
const backendPort = config.server?.backendPort ?? 3331;
const frontendPort = config.server?.frontendPort ?? 3330;

// Run check-application if requested
if (values.check) {
	const checkResult = Bun.spawnSync(['bun', 'run', 'check-application'], {
		cwd: rootDir,
		stdio: ['inherit', 'inherit', 'inherit'],
	});
	if (checkResult.exitCode !== 0) {
		process.exit(checkResult.exitCode ?? 1);
	}
}

// Report a stale backend PID before stop.ts performs cleanup. --from-start makes
// stale backend or frontend PID files recoverable within this start attempt.
const existingBackendPid = readPidFile(logsDir, 'backend');
if (existingBackendPid !== null && !isProcessAlive(existingBackendPid)) {
	console.log(
		`⚠ Found stale backend.pid (PID ${existingBackendPid}) — previous backend exited silently. Check logs/backend.error.log.`,
	);
}

// Stop any existing processes first
const stopResult = Bun.spawnSync(['bun', 'run', 'stop', '--', '--from-start'], {
	cwd: rootDir,
	stdio: ['inherit', 'inherit', 'inherit'],
});
if (stopResult.exitCode !== 0) {
	console.error('❌ Failed to stop existing processes');
	process.exit(1);
}

console.log(`\n🚀 Starting ${appSlug} in background mode...`);
console.log(`   Logs directory: ${logsDir}`);

/**
 * Explain why a service never listened. A crash and a slow start used to share one message, and
 * the slow case killed a healthy process before it had written a log line, so its empty logs
 * pointed nowhere.
 */
function reportStartFailure(
	serviceName: string,
	result: Exclude<PortWaitResult, 'listening'>,
	errorLog: string,
): void {
	if (result === 'exited') {
		console.error(`   ❌ ${serviceName} exited before it started listening`);
	} else {
		console.error(
			`   ❌ ${serviceName} was still starting after ${String(PORT_CHECK_TIMEOUT_MS / 1000)}s and has been stopped`,
		);
		console.error(
			'   (Its logs can be empty: nothing is written until its modules finish loading.)',
		);
	}
	console.error(`   Check logs at ${errorLog}`);
}

// Start backend
const backendPid = spawnBackground(
	logsDir,
	'backend',
	'bun',
	['src/app.ts'],
	path.join(rootDir, 'backend'),
);

if (!backendPid) {
	console.error('   ❌ Failed to spawn backend process');
	process.exit(1);
}

console.log(`   ✓ Backend spawned (PID: ${backendPid}, port: ${backendPort})`);
console.log(`   Waiting for backend to be ready...`);

const backendWait = await waitForPort(backendPort, 'Backend', {
	isAlive: () => isProcessAlive(backendPid),
});
if (backendWait !== 'listening') {
	reportStartFailure('Backend', backendWait, `${logsDir}/backend.error.log`);
	killProcessByPidFile(logsDir, 'backend');
	process.exit(1);
}

// Start frontend
const frontendPid = spawnBackground(
	logsDir,
	'frontend',
	'bun',
	values.preview
		? ['x', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(frontendPort)]
		: ['run', 'dev'],
	path.join(rootDir, 'frontend'),
);

if (!frontendPid) {
	console.error('   ❌ Failed to spawn frontend process');
	killProcessByPidFile(logsDir, 'backend');
	process.exit(1);
}

console.log(`   ✓ Frontend spawned (PID: ${frontendPid}, port: ${frontendPort})`);
console.log(`   Waiting for frontend to be ready...`);

const frontendWait = await waitForPort(frontendPort, 'Frontend', {
	isAlive: () => isProcessAlive(frontendPid),
});
if (frontendWait !== 'listening') {
	reportStartFailure('Frontend', frontendWait, `${logsDir}/frontend.error.log`);
	killProcessByPidFile(logsDir, 'frontend');
	killProcessByPidFile(logsDir, 'backend');
	process.exit(1);
}

console.log(`\n✅ ${appSlug} is running in the background.`);
console.log(`   Backend:  http://localhost:${backendPort}`);
console.log(`   Frontend: http://localhost:${frontendPort}`);
console.log(`   Logs:     ${logsDir}/`);
console.log(`   Stop:     bun run stop`);
