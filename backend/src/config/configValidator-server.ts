import type { AppConfig } from './configSchema.ts';
import type { ValidationIssue } from './configValidator-secrets.ts';

import { configLogger } from './configLogger.ts';
import {
	checkAllowNoOrigin,
	checkAuditWhitelistProxy,
	checkAuthRateLimitConfig,
	checkDemoCredentials,
	checkEmptyAllowedOrigins,
	checkFrontendDevOrigins,
	checkHstsWithInsecureCookies,
	checkInsecureCookies,
	checkJwtExpiryFormat,
	checkPostgresSsl,
	checkRateLimitConfig,
	checkTrustProxy,
	checkUnencryptedBackups,
	checkWebhookUrlSsrf,
} from './configValidator-server-checks.ts';

// ---------------------------------------------------------------------------
// Runtime validators — call predicates, then log/exit
// ---------------------------------------------------------------------------

function emitIssues(issues: ValidationIssue[]): void {
	for (const issue of issues) {
		if (issue.level === 'error') {
			configLogger.error(`SECURITY ERROR: ${issue.field} — ${issue.message}`);
		} else {
			configLogger.warn(`SECURITY WARNING: ${issue.field} — ${issue.message}`);
		}
	}
	if (issues.some((i) => i.level === 'error')) {
		process.exit(1);
	}
}

function emitIssuesRaw(issues: ValidationIssue[]): void {
	for (const issue of issues) {
		if (issue.level === 'error') {
			configLogger.error(issue.message);
			process.exit(1);
		} else {
			configLogger.warn(issue.message);
		}
	}
}

function validateDemoCredentials(nodeEnv: string, testing: AppConfig['testing']): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkDemoCredentials(isDevOrTest, testing);
	if (issues.length > 0) {
		configLogger.error(
			{ issues: issues.map((i) => i.message) },
			'SECURITY ERROR: Demo credentials detected in non-development environment'
		);
		configLogger.info(
			'\nUpdate testing.crawlLoginEmail and testing.crawlLoginPassword in your config file'
		);
		process.exit(1);
	}
}

function warnDisabledRateLimit(nodeEnv: string, rateLimitEnabled: boolean): void {
	const isDev = nodeEnv === 'development';
	emitIssuesRaw(checkRateLimitConfig(isDev, rateLimitEnabled));
}

function warnDisabledAuthRateLimit(nodeEnv: string, authRateLimitEnabled: boolean): void {
	const isDev = nodeEnv === 'development';
	emitIssuesRaw(checkAuthRateLimitConfig(isDev, authRateLimitEnabled));
}

function warnUnsafeTrustProxy(
	nodeEnv: string,
	trustProxy: boolean,
	trustedProxies: string[]
): void {
	const issues = checkTrustProxy(nodeEnv, trustProxy, trustedProxies);
	emitIssues(issues);
}

function warnInsecureCookies(nodeEnv: string, cookieSecure: boolean): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkInsecureCookies(isDevOrTest, cookieSecure);
	emitIssues(issues);
}

function warnHstsWithInsecureCookies(nodeEnv: string, cookieSecure: boolean): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkHstsWithInsecureCookies(isDevOrTest, cookieSecure);
	emitIssues(issues);
}

function warnUnencryptedBackups(nodeEnv: string, encrypt: boolean): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkUnencryptedBackups(isDevOrTest, encrypt);
	emitIssues(issues);
}

function warnPostgresSsl(nodeEnv: string, database: AppConfig['database']): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkPostgresSsl(
		isDevOrTest,
		database.dialect,
		database.ssl.enabled,
		database.ssl.rejectUnauthorized,
		database.url
	);
	emitIssues(issues);
}

function warnEmptyAllowedOrigins(
	nodeEnv: string,
	trustProxy: boolean,
	allowedOrigins: string[]
): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkEmptyAllowedOrigins(isDevOrTest, trustProxy, allowedOrigins);
	emitIssues(issues);
}

function warnAllowNoOrigin(nodeEnv: string, allowNoOrigin: boolean): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkAllowNoOrigin(isDevOrTest, allowNoOrigin);
	emitIssues(issues);
}

function warnFrontendDevOriginsInProduction(nodeEnv: string, frontendDevOrigins: string[]): void {
	const isDevOrTest = nodeEnv === 'development' || nodeEnv === 'test';
	const issues = checkFrontendDevOrigins(isDevOrTest, frontendDevOrigins);
	emitIssues(issues);
}

function validateJwtExpiryFormat(nodeEnv: string, security: AppConfig['security']): void {
	const isDev = nodeEnv === 'development';
	const issues = checkJwtExpiryFormat(isDev, security);
	emitIssues(issues);
}

function warnAuditWhitelistProxy(trustProxy: boolean, ipWhitelist: string[]): void {
	const issues = checkAuditWhitelistProxy(trustProxy, ipWhitelist);
	emitIssues(issues);
}

function warnWebhookUrlSsrf(webhookUrl: string): void {
	const issues = checkWebhookUrlSsrf(webhookUrl);
	emitIssues(issues);
}

// ---------------------------------------------------------------------------
// Collect function — delegates to same predicates
// ---------------------------------------------------------------------------

/**
 * Collect server/security validation issues as data instead of logging/exiting.
 * Used by config:validate script for standalone validation.
 */
function collectServerIssues(nodeEnv: string, validated: AppConfig): ValidationIssue[] {
	const isDev = nodeEnv === 'development';
	const isDevOrTest = isDev || nodeEnv === 'test';

	return [
		...checkDemoCredentials(isDevOrTest, validated.testing),
		...checkRateLimitConfig(isDev, validated.rateLimit.enabled),
		...checkAuthRateLimitConfig(isDev, validated.rateLimit.authEnabled),
		...checkTrustProxy(nodeEnv, validated.server.trustProxy, validated.server.trustedProxies),
		...checkInsecureCookies(isDevOrTest, validated.security.cookieSecure),
		...checkHstsWithInsecureCookies(isDevOrTest, validated.security.cookieSecure),
		...checkUnencryptedBackups(isDevOrTest, validated.database.backup.encrypt),
		...checkPostgresSsl(
			isDevOrTest,
			validated.database.dialect,
			validated.database.ssl.enabled,
			validated.database.ssl.rejectUnauthorized,
			validated.database.url
		),
		...checkEmptyAllowedOrigins(
			isDevOrTest,
			validated.server.trustProxy,
			validated.cors.allowedOrigins
		),
		...checkAllowNoOrigin(isDevOrTest, validated.cors.allowNoOrigin),
		...checkFrontendDevOrigins(isDevOrTest, validated.cors.frontendDevOrigins),
		...checkJwtExpiryFormat(isDev, validated.security),
		...checkAuditWhitelistProxy(validated.server.trustProxy, validated.audit.ipWhitelist),
		...checkWebhookUrlSsrf(validated.alerting.webhook.url),
	];
}

export {
	collectServerIssues,
	validateDemoCredentials,
	validateJwtExpiryFormat,
	warnAllowNoOrigin,
	warnAuditWhitelistProxy,
	warnDisabledAuthRateLimit,
	warnDisabledRateLimit,
	warnEmptyAllowedOrigins,
	warnFrontendDevOriginsInProduction,
	warnHstsWithInsecureCookies,
	warnInsecureCookies,
	warnPostgresSsl,
	warnUnencryptedBackups,
	warnUnsafeTrustProxy,
	warnWebhookUrlSsrf,
};
