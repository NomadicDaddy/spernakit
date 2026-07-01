import pino from 'pino';

// Bootstrap-only process.env read; see configSecrets.ts policy comment for the full exception rationale.
const isProduction = process.env.NODE_ENV === 'production';

/**
 * Redaction paths shared with the main application logger to prevent
 * accidental secret leakage during config validation and startup.
 */
const REDACT_PATHS = [
	'accessToken',
	'apiKey',
	'authorization',
	'connectionPassword',
	'password',
	'refreshToken',
	'secret',
	'smtpPassword',
	'token',
	'*.accessToken',
	'*.apiKey',
	'*.authorization',
	'*.password',
	'*.refreshToken',
	'*.secret',
	'*.token',
	'**.accessToken',
	'**.apiKey',
	'**.authorization',
	'**.clientSecret',
	'**.connectionPassword',
	'**.keySecret',
	'**.password',
	'**.refreshToken',
	'**.secret',
	'**.smtpPassword',
	'**.token',
];

/**
 * Shared logger for config modules. Uses structured JSON in production
 * and pino-pretty in development. Initialized before app config is loaded,
 * so it reads NODE_ENV directly from the environment.
 */
export const configLogger = pino({
	level: 'debug',
	redact: REDACT_PATHS,
	...(isProduction
		? {}
		: {
				transport: {
					options: {
						colorize: true,
						ignore: 'pid,hostname',
						translateTime: 'HH:MM:ss',
					},
					target: 'pino-pretty',
				},
			}),
});
