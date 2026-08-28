import { createRequire } from 'node:module';
import pino from 'pino';

import type { AppConfig } from '../config/configSchema.ts';

import { getConfig } from '../config/configLoader.ts';
import { configLogger } from '../config/configLogger.ts';
import { LogCategory, type LogCategoryType } from './logCategories.ts';

type LogLevel = 'debug' | 'error' | 'info' | 'warn';

/** Paths to redact from log output to prevent accidental secret leakage. */
const REDACT_PATHS = [
	'accessToken',
	'apiKey',
	'authorization',
	'connectionPassword',
	'email',
	'keySecret',
	'password',
	'refreshToken',
	'secret',
	'smtpPassword',
	'token',
	'usernameOrEmail',
	'*.accessToken',
	'*.apiKey',
	'*.authorization',
	'*.email',
	'*.password',
	'*.refreshToken',
	'*.secret',
	'*.token',
	'*.usernameOrEmail',
	// Deep nested paths (e.g., config.oauth.github.clientSecret)
	'**.accessToken',
	'**.apiKey',
	'**.authorization',
	'**.clientSecret',
	'**.connectionPassword',
	'**.email',
	'**.keySecret',
	'**.password',
	'**.refreshToken',
	'**.secret',
	'**.smtpPassword',
	'**.token',
	'**.usernameOrEmail',
];

/**
 * Resolve a transport module to an absolute path.
 *
 * pino resolves a bare target name against the files on the stack that called it, which under Bun
 * is the process entry rather than this module. A process that starts anywhere outside backend/
 * therefore dies with "unable to determine transport target for pino-pretty" instead of logging.
 * Resolving from this file gives the same answer for every entry point.
 *
 * @param name - Transport package to resolve
 * @returns Absolute path pino can load without consulting the call stack
 */
function resolveTransport(name: string): string {
	return createRequire(import.meta.url).resolve(name);
}

/** The stderr file descriptor, which is what `logs/<name>.error.log` is a copy of. */
const STDERR_FD = 2;

/** Shared pino-pretty options. Each target chooses its own colorize and destination. */
const PRETTY_OPTIONS = { ignore: 'pid,hostname', translateTime: 'HH:MM:ss' };

/**
 * Build the target that copies application errors onto the process's stderr stream.
 *
 * `logs/<name>.error.log` is that stream. scripts/lib/process/spawn-background.ts opens the file
 * as the spawned server's stderr descriptor, and scripts/dev-with-logs.ts writes the server's
 * stderr into a stream of the same name. Pino sends every level to stdout, so without this target
 * the file named error.log could only ever hold process-level output such as a crash or an
 * interpreter warning, and never a single application error. Anything reading it to judge whether
 * a start-up was clean was reading a file that could not hold the evidence it looked for.
 *
 * Errors are copied here rather than moved, so the main log still holds every level and remains
 * readable on its own. Redaction is a logger-level setting, so REDACT_PATHS covers this target too.
 *
 * @param target - Transport module to write with, matching the one the main target uses
 * @param options - Options for that transport; the destination is overridden to stderr
 * @returns Transport target that receives error and above
 */
function buildErrorStreamTarget(
	target: string,
	options: Record<string, unknown>,
): pino.TransportTargetOptions {
	return { level: 'error', options: { ...options, destination: STDERR_FD }, target };
}

/**
 * Build the rotated-file target, when file logging is configured.
 *
 * The file is for log aggregation tools like Filebeat or Fluentd, alongside the stdout target a
 * container log driver reads. It uses pino-roll to cap disk growth: rolls daily OR when the
 * current file exceeds `logging.file.maxSize`, whichever comes first, and prunes old rolls beyond
 * `logging.file.maxFiles`. pino-roll appends a rotation-index suffix to the configured path
 * (e.g. `app.1.log`, `app.2.log`), so log-aggregator globs should target `app.*.log`.
 * @param config - Application configuration
 * @returns Transport target for the rotated file, or undefined when file logging is off
 */
function buildFileTarget(config: AppConfig): pino.TransportTargetOptions | undefined {
	const fileConfig = config.logging?.file;

	if (!fileConfig?.enabled || !fileConfig.path) {
		return undefined;
	}

	return {
		level: config.logging.level,
		options: {
			file: fileConfig.path,
			frequency: 'daily',
			limit: { count: fileConfig.maxFiles },
			mkdir: true,
			size: fileConfig.maxSize,
		},
		target: resolveTransport('pino-roll'),
	};
}

/**
 * Create a pino logger for a given configuration.
 *
 * - Development: pretty-printed to stdout, with error and above also written to stderr.
 * - Production (default): structured JSON to stdout, with error and above also to stderr.
 * - Production (file enabled): both of the above plus a rotated JSON file, allowing log
 *   aggregation tools (Filebeat, Fluentd, Promtail) to collect from the file while Docker or
 *   systemd captures stdout.
 *
 * Every mode writes errors to stderr, because the tooling reads them from there: see
 * buildErrorStreamTarget above for what depends on that.
 *
 * Configure via `logging` section in spernakit.json:
 *   - `logging.level`: Log level (debug, info, warn, error)
 *   - `logging.file.enabled`: Enable file-based logging
 *   - `logging.file.path`: Path to the log file (e.g., "./logs/app.log")
 *   - `logging.file.maxSize`: Max file size before rotation, pino-roll size
 *     string (e.g., "10M", "500K") — rolled at the first crossing of daily
 *     boundary OR the configured size, whichever comes first
 *   - `logging.file.maxFiles`: Max rolled files to keep; older files are
 *     pruned automatically by pino-roll
 *
 * Exported so a gate can exercise a mode the current process is not running in. The application
 * itself takes the logger built by createLogger() below.
 *
 * @param config - Application configuration, or undefined when none has loaded yet
 * @returns Configured pino logger instance
 */
function createLoggerForConfig(config: AppConfig | undefined): pino.Logger {
	const nodeEnv = config?.server.nodeEnv ?? 'development';

	if (nodeEnv === 'development') {
		return pino({
			level: 'debug',
			redact: REDACT_PATHS,
			transport: {
				targets: [
					{
						level: 'debug',
						options: { ...PRETTY_OPTIONS, colorize: true },
						target: resolveTransport('pino-pretty'),
					},
					// Uncolored: this copy is read back out of a file, not off a terminal.
					buildErrorStreamTarget(resolveTransport('pino-pretty'), {
						...PRETTY_OPTIONS,
						colorize: false,
					}),
				],
			},
		});
	}

	const level = config?.logging?.level ?? 'info';
	const targets: pino.TransportTargetOptions[] = [
		{ level, options: {}, target: 'pino/file' },
		buildErrorStreamTarget('pino/file', {}),
	];

	const fileTarget = config ? buildFileTarget(config) : undefined;
	if (fileTarget) {
		targets.push(fileTarget);
	}

	return pino({ level, redact: REDACT_PATHS, transport: { targets } });
}

/**
 * Create the application-wide pino logger from the loaded configuration.
 *
 * @returns Configured pino logger instance
 */
function createLogger(): pino.Logger {
	let config: AppConfig | undefined;
	try {
		config = getConfig();
	} catch {
		// ESM dependencies load before app initialization; use the bootstrap logger.
		return configLogger;
	}

	return createLoggerForConfig(config);
}

const logger = createLogger();

/**
 * Log a message with a structured category.
 *
 * Categories enable filtering and analysis in log aggregation services.
 * All log entries include the category as a top-level field.
 *
 * @param level - The log level (debug, info, warn, error)
 * @param category - The log category (from LogCategory constants)
 * @param message - The log message
 * @param meta - Additional metadata to include in the log entry
 *
 * @example
 * ```typescript
 * logWithCategory('info', LogCategory.AUTH, 'User logged in', { userId: 123 });
 * // Output: { category: 'auth', userId: 123, msg: 'User logged in' }
 * ```
 */
function logWithCategory(
	level: LogLevel,
	category: LogCategoryType,
	message: string,
	meta?: Record<string, unknown>,
): void {
	logger[level]({ category, ...meta }, message);
}

/**
 * Log an API request/response event.
 *
 * @param level - The log level
 * @param message - The log message
 * @param meta - Request metadata (method, path, status, duration, requestId)
 */
function logApi(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
	logWithCategory(level, LogCategory.API, message, meta);
}

/**
 * Log an authentication/authorization event.
 *
 * @param level - The log level
 * @param message - The log message
 * @param meta - Auth metadata (userId, username, action, success)
 */
function logAuth(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
	logWithCategory(level, LogCategory.AUTH, message, meta);
}

/**
 * Log a database operation event.
 *
 * @param level - The log level
 * @param message - The log message
 * @param meta - Database metadata (operation, table, durationMs)
 */
function logDatabase(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
	logWithCategory(level, LogCategory.DATABASE, message, meta);
}

/**
 * Log a scheduled task event.
 *
 * @param level - The log level
 * @param message - The log message
 * @param meta - Scheduler metadata (taskName, status, durationMs)
 */
function logScheduler(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
	logWithCategory(level, LogCategory.SCHEDULER, message, meta);
}

export { createLoggerForConfig, logApi, logAuth, logDatabase, logger, logScheduler, REDACT_PATHS };
