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
import { PORT_CHECK_TIMEOUT_MS, waitForPort } from './lib/process/ports.ts';
import { spawnBackground } from './lib/process/spawn-background.ts';
import { loadJsonConfig } from './load-json-config.ts';

const rootDir = path.resolve(import.meta.dirname, '..');
const logsDir = path.join(rootDir, 'logs');

// Parse arguments
const { values } = parseArgs({
	args: process.argv.slice(2),
	options: {
		check: { default: false, type: 'boolean' },
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

// Surface a richer hint when the previous backend exited silently, then let
// stop.ts handle the actual cleanup. We pass --from-start so stop treats stale
// PID files (backend OR frontend) as the normal recoverable case and cleans
// them up without exiting non-zero — so the operator recovers with a single
// `bun run start` instead of having to run it twice.
const existingBackendPid = readPidFile(logsDir, 'backend');
if (existingBackendPid !== null && !isProcessAlive(existingBackendPid)) {
	console.log(
		`⚠ Found stale backend.pid (PID ${existingBackendPid}) — previous backend exited silently. Check logs/backend.error.log.`
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

// Start backend
const backendPid = spawnBackground(
	logsDir,
	'backend',
	'bun',
	['src/app.ts'],
	path.join(rootDir, 'backend')
);

if (!backendPid) {
	console.error('   ❌ Failed to spawn backend process');
	process.exit(1);
}

console.log(`   ✓ Backend spawned (PID: ${backendPid}, port: ${backendPort})`);
console.log(`   Waiting for backend to be ready...`);

const backendReady = await waitForPort(backendPort, 'Backend');
if (!backendReady) {
	console.error(`   ❌ Backend failed to start within ${PORT_CHECK_TIMEOUT_MS / 1000}s`);
	console.error(`   Check logs at ${logsDir}/backend.error.log`);
	killProcessByPidFile(logsDir, 'backend');
	process.exit(1);
}

// Start frontend
const frontendPid = spawnBackground(
	logsDir,
	'frontend',
	'bun',
	['run', 'dev'],
	path.join(rootDir, 'frontend')
);

if (!frontendPid) {
	console.error('   ❌ Failed to spawn frontend process');
	killProcessByPidFile(logsDir, 'backend');
	process.exit(1);
}

console.log(`   ✓ Frontend spawned (PID: ${frontendPid}, port: ${frontendPort})`);
console.log(`   Waiting for frontend to be ready...`);

const frontendReady = await waitForPort(frontendPort, 'Frontend');
if (!frontendReady) {
	console.error(`   ❌ Frontend failed to start within ${PORT_CHECK_TIMEOUT_MS / 1000}s`);
	console.error(`   Check logs at ${logsDir}/frontend.error.log`);
	killProcessByPidFile(logsDir, 'frontend');
	killProcessByPidFile(logsDir, 'backend');
	process.exit(1);
}

console.log(`\n✅ ${appSlug} is running in the background.`);
console.log(`   Backend:  http://localhost:${backendPort}`);
console.log(`   Frontend: http://localhost:${frontendPort}`);
console.log(`   Logs:     ${logsDir}/`);
console.log(`   Stop:     bun run stop`);
