import pino from 'pino';

import { LOG_SECRET_REDACTION_HOOKS } from '../utils/logSecretRedaction.ts';
import { resolveOptionalTransport } from '../utils/logTransport.ts';

// Bootstrap-only process.env read; see configSecrets.ts policy comment for the full exception rationale.
const isProduction = process.env.NODE_ENV === 'production';

// Undefined in production, and wherever pino-pretty is not installed: an image built from
// production dependencies runs scripts such as the seed without NODE_ENV set.
const prettyTransport = isProduction ? undefined : resolveOptionalTransport('pino-pretty');

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
 * and pino-pretty in development, when pino-pretty is installed. Initialized
 * before app config is loaded, so it reads NODE_ENV directly from the environment.
 */
export const configLogger = pino({
	hooks: LOG_SECRET_REDACTION_HOOKS,
	level: 'debug',
	redact: REDACT_PATHS,
	...(prettyTransport === undefined
		? {}
		: {
				transport: {
					options: {
						colorize: true,
						ignore: 'pid,hostname',
						translateTime: 'HH:MM:ss',
					},
					target: prettyTransport,
				},
			}),
});
