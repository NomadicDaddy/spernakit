#!/usr/bin/env bun
/**
 * Development server launcher with log file rotation
 *
 * This script starts both backend and frontend servers and redirects their output
 * to rotating log files in the /logs directory.
 *
 * Features:
 * - Automatic log rotation (daily or when file reaches 10MB)
 * - Keeps last 7 days of logs
 * - Graceful shutdown handling
 * - Color-coded console output
 */
import { type ChildProcess, spawn } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStream, type RotatingFileStream } from 'rotating-file-stream';

import { loadJsonConfig } from './load-json-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const logsDir = join(rootDir, 'logs');

// Ensure logs directory exists
if (!existsSync(logsDir)) {
	mkdirSync(logsDir, { recursive: true });
}

// Populate environment from JSON config for child processes
loadJsonConfig(rootDir);

// ANSI color codes
const colors: Record<string, string> = {
	blue: '\x1b[34m',
	bright: '\x1b[1m',
	cyan: '\x1b[36m',
	dim: '\x1b[2m',
	green: '\x1b[32m',
	magenta: '\x1b[35m',
	red: '\x1b[31m',
	reset: '\x1b[0m',
	yellow: '\x1b[33m',
};

/**
 * Rotate existing log file if it exists and is large
 */
async function rotateExistingLog(filename: string): Promise<void> {
	const logPath = join(logsDir, filename);

	if (!existsSync(logPath)) {
		return; // No existing log file
	}

	try {
		const stats = statSync(logPath);
		const fileSizeMB = stats.size / (1024 * 1024);

		// Rotate if file is larger than 10MB or older than 1 day
		const fileAgeHours = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60);
		const shouldRotate = fileSizeMB > 10 || fileAgeHours > 24;

		if (shouldRotate) {
			const timestamp = stats.mtime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
			const rotatedName = filename.replace(/\.log$/, `-${timestamp}.log`);
			const rotatedPath = join(logsDir, rotatedName);

			renameSync(logPath, rotatedPath);
			console.log(
				`${colors['dim']}Rotated existing log: ${filename} → ${rotatedName} (${fileSizeMB.toFixed(2)}MB)${colors['reset']}`
			);
		}
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		console.error(
			`${colors['red']}Failed to rotate ${filename}: ${typedErr.message}${colors['reset']}`
		);
	}
}

/**
 * Create a rotating file stream for logs
 */
function createRotatingStream(filename: string): RotatingFileStream {
	// Rotate existing log file if needed
	rotateExistingLog(filename);

	return createStream(filename, {
		interval: '1d', // Rotate daily
		maxFiles: 7, // Keep 7 days of logs
		maxSize: '10M', // Rotate when file reaches 10MB
		path: logsDir,
		// Note: compression disabled - rotated files will not be compressed
	});
}

/**
 * Strip ANSI escape sequences from text
 */
function stripAnsi(text: string): string {
	// eslint-disable-next-line no-control-regex -- ANSI escape sequences require control characters
	return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * Format timestamp for console output
 */
function getTimestamp(): string {
	return new Date().toLocaleTimeString('en-US', { hour12: false });
}

/**
 * Log to console with color and prefix
 */
function log(prefix: string, message: string, color = colors['reset'] ?? ''): void {
	const lines = message
		.toString()
		.split('\n')
		.filter((line) => line.trim());
	lines.forEach((line) => {
		console.log(
			`${colors['dim']}[${getTimestamp()}]${colors['reset']} ${color}[${prefix}]${colors['reset']} ${line}`
		);
	});
}

/**
 * Process log lines and add timestamps where needed
 */
function processLogLines(cleanMessage: string): string {
	const lines = cleanMessage.split('\n');
	const processedLines = lines.map((line) => {
		// Skip empty lines
		if (!line.trim()) {
			return line;
		}

		// Check if line already has a timestamp
		// Backend logger (Winston) format: 2025-11-14T15:21:34.123Z [LEVEL]:
		// Morgan format: 127.0.0.1 - - [06/Nov/2025:14:53:21 +0000]
		const hasWinstonTimestamp = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(line.trim());
		const hasMorganTimestamp = /^\d+\.\d+\.\d+\.\d+ - - \[/.test(line.trim());

		if (hasWinstonTimestamp || hasMorganTimestamp) {
			// Already has timestamp, keep as-is
			return line;
		} else {
			// Add ISO 8601 timestamp for consistency
			const ts = new Date().toISOString();
			return `${ts} ${line}`;
		}
	});

	return processedLines.join('\n');
}

/**
 * Start a server process with log redirection
 */
function startServer(name: string, command: string, args: string[], color: string): ChildProcess {
	log(name, `Starting ${name} server...`, color);

	// Create rotating log streams
	const logStream = createRotatingStream(`${name}.log`);
	const errorStream = createRotatingStream(`${name}.error.log`);

	// Spawn the process
	// Note: shell: false is more secure when passing args as array
	const proc = spawn(command, args, {
		cwd: rootDir,
		env: { ...process.env, FORCE_COLOR: '1' },
		shell: false, // Enable colors in output
	});

	// Handle stdout
	proc.stdout?.on('data', (data: Buffer) => {
		const message = data.toString();
		log(name, message, color);

		// Strip ANSI codes before writing to file
		const cleanMessage = stripAnsi(message);
		logStream.write(processLogLines(cleanMessage));
	});

	// Handle stderr
	proc.stderr?.on('data', (data: Buffer) => {
		const message = data.toString();
		log(name, message, colors['red'] ?? '');

		// Strip ANSI codes before writing to file
		const cleanMessage = stripAnsi(message);
		errorStream.write(processLogLines(cleanMessage));
	});

	// Handle process exit
	proc.on('close', (code: null | number) => {
		const exitColor = code === 0 ? colors['green'] : colors['red'];
		log(name, `Process exited with code ${code}`, exitColor ?? '');
		logStream.end();
		errorStream.end();
	});

	// Handle process errors
	proc.on('error', (error: Error) => {
		log(name, `Process error: ${error.message}`, colors['red'] ?? '');
		// Add timestamp for process errors since they don't come from Winston
		errorStream.write(`[${new Date().toISOString()}] ERROR: ${error.message}\n`);
	});

	return proc;
}

// Start servers
console.log(
	`${colors['bright']}${colors['cyan']}🚀 Starting Development Servers${colors['reset']}`
);
console.log(`${colors['dim']}Logs directory: ${logsDir}${colors['reset']}\n`);

const backend = startServer(
	'backend',
	'bun',
	['run', '--cwd', 'backend', 'dev'],
	colors['blue'] ?? ''
);
const frontend = startServer(
	'frontend',
	'bun',
	['run', '--cwd', 'frontend', 'dev'],
	colors['magenta'] ?? ''
);

// Handle graceful shutdown
const shutdown = (signal: string): void => {
	console.log(
		`\n${colors['yellow']}Received ${signal}, shutting down gracefully...${colors['reset']}`
	);

	backend.kill('SIGTERM');
	frontend.kill('SIGTERM');

	// Force kill after 5 seconds if processes don't exit
	setTimeout(() => {
		console.log(`${colors['red']}Force killing processes...${colors['reset']}`);
		backend.kill('SIGKILL');
		frontend.kill('SIGKILL');
		process.exit(1);
	}, 5000);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
	console.error(`${colors['red']}Uncaught exception: ${error.message}${colors['reset']}`);
	console.error(error.stack);
	shutdown('uncaughtException');
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown, promise: Promise<unknown>) => {
	console.error(`${colors['red']}Unhandled rejection at:${colors['reset']}`, promise);
	console.error(`${colors['red']}Reason:${colors['reset']}`, reason);
});

// Keep the process alive
process.stdin.resume();
