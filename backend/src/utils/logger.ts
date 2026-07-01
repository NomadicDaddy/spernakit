import pino from 'pino';

import type { AppConfig } from '../config/configSchema.ts';

import { getConfig } from '../config/configLoader.ts';
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
 * Build pino transport targets based on configuration.
 *
 * When file logging is enabled, logs are written to both stdout (for container
 * log drivers) and a rotated JSON file (for log aggregation tools like
 * Filebeat/Fluentd). The file target uses pino-roll to cap disk growth: rolls
 * daily OR when the current file exceeds `logging.file.maxSize`, whichever
 * comes first, and prunes old rolls beyond `logging.file.maxFiles`. pino-roll
 * appends a rotation-index suffix to the configured path (e.g. `app.1.log`,
 * `app.2.log`), so log-aggregator globs should target `app.*.log`.
 * @param config - Application configuration
 * @returns Transport config for multi-target output, or undefined for stdout-only
 */
function buildTransportTargets(config: AppConfig): pino.TransportMultiOptions | undefined {
	const fileConfig = config.logging?.file;

	if (!fileConfig?.enabled || !fileConfig.path) {
		return undefined;
	}

	return {
		targets: [
			{ level: config.logging.level, options: {}, target: 'pino/file' },
			{
				level: config.logging.level,
				options: {
					file: fileConfig.path,
					frequency: 'daily',
					limit: { count: fileConfig.maxFiles },
					mkdir: true,
					size: fileConfig.maxSize,
				},
				target: 'pino-roll',
			},
		],
	};
}

/**
 * Create the application-wide pino logger.
 *
 * - Development: pretty-printed to stdout via pino-pretty transport.
 * - Production (default): structured JSON to stdout for container log drivers.
 * - Production (file enabled): structured JSON to both stdout and a log file,
 *   allowing log aggregation tools (Filebeat, Fluentd, Promtail) to collect
 *   from the file while Docker/systemd captures stdout.
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
 * @returns Configured pino logger instance
 */
function createLogger(): pino.Logger {
	let config: AppConfig | undefined;
	try {
		config = getConfig();
	} catch {
		// Config not yet initialized — default to development
	}

	const nodeEnv = config?.server.nodeEnv ?? 'development';
	const isDev = nodeEnv === 'development';

	if (isDev) {
		return pino({
			level: 'debug',
			redact: REDACT_PATHS,
			transport: {
				options: {
					colorize: true,
					ignore: 'pid,hostname',
					translateTime: 'HH:MM:ss',
				},
				target: 'pino-pretty',
			},
		});
	}

	const level = config?.logging?.level ?? 'info';
	const transport = config ? buildTransportTargets(config) : undefined;

	if (transport) {
		return pino({ level, redact: REDACT_PATHS, transport });
	}

	return pino({ level, redact: REDACT_PATHS });
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
	meta?: Record<string, unknown>
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

export { logApi, logAuth, logDatabase, logger, logScheduler, REDACT_PATHS };
