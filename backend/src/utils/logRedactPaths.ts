/**
 * Paths to redact from log output to prevent accidental secret leakage.
 *
 * Split from `logger.ts` when that module outgrew the 300-line modularity gate. The bootstrap
 * logger in `config/configLogger.ts` keeps its own shorter list on purpose: it runs before
 * configuration exists and logs no user records.
 */
export const REDACT_PATHS = [
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
