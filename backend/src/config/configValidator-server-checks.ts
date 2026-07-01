import type { AppConfig } from './configSchema.ts';
import type { ValidationIssue } from './configValidator-secrets-checks.ts';

import { isLoopbackAddressOrHostname, LOOPBACK_IPS } from '../utils/loopback.ts';
import { isBlockedIpv4 } from '../utils/urlValidator.ts';

const DEMO_EMAILS = [
	'sysop@example.com',
	'admin@example.com',
	'manager@example.com',
	'operator@example.com',
	'viewer@example.com',
];
const DEMO_PASSWORDS = ['sysop123', 'admin123', 'manager123', 'operator123', 'viewer123'];
const JWT_EXPIRY_PATTERN = /^\d+[dhms]$/;
// sslmode values that negotiate TLS; `disable`, `allow`, and `prefer` do not guarantee encryption.
const PG_SSLMODE_STRICT = /[?&]sslmode=(require|verify-ca|verify-full)\b/i;

function ssrfIssue(message: string): ValidationIssue[] {
	return [{ field: 'alerting.webhook.url', level: 'error', message }];
}

function checkDemoCredentials(
	isDevOrTest: boolean,
	testing: AppConfig['testing']
): ValidationIssue[] {
	if (isDevOrTest) return [];
	const issues: ValidationIssue[] = [];
	if (testing.crawlLoginEmail && DEMO_EMAILS.includes(testing.crawlLoginEmail)) {
		issues.push({
			field: 'testing.crawlLoginEmail',
			level: 'error',
			message: `uses demo value: ${testing.crawlLoginEmail}`,
		});
	}
	if (testing.crawlLoginPassword && DEMO_PASSWORDS.includes(testing.crawlLoginPassword)) {
		issues.push({
			field: 'testing.crawlLoginPassword',
			level: 'error',
			message: 'uses a demo password',
		});
	}
	return issues;
}

function checkRateLimitConfig(isDev: boolean, enabled: boolean): ValidationIssue[] {
	if (enabled) return [];
	return [
		{
			field: 'rateLimit.enabled',
			level: isDev ? 'warning' : 'error',
			message: isDev
				? 'rate limiting disabled (acceptable in development)'
				: 'rate limiting disabled — exposes application to DoS attacks',
		},
	];
}

function checkAuthRateLimitConfig(isDev: boolean, authEnabled: boolean): ValidationIssue[] {
	if (authEnabled) return [];
	return [
		{
			field: 'rateLimit.authEnabled',
			level: isDev ? 'warning' : 'error',
			message: isDev
				? 'auth rate limiting disabled (acceptable in development)'
				: 'auth rate limiting disabled — exposes authentication endpoints to brute-force attacks',
		},
	];
}

function checkTrustProxy(
	nodeEnv: string,
	trustProxy: boolean,
	trustedProxies: string[]
): ValidationIssue[] {
	if (!trustProxy || trustedProxies.length > 0) return [];
	return [
		{
			field: 'server.trustedProxies',
			level: nodeEnv === 'production' ? 'error' : 'warning',
			message:
				'trustProxy enabled but trustedProxies is empty — allows IP spoofing via X-Forwarded-For',
		},
	];
}

function checkInsecureCookies(isDevOrTest: boolean, cookieSecure: boolean): ValidationIssue[] {
	if (cookieSecure || isDevOrTest) return [];
	return [
		{
			field: 'security.cookieSecure',
			level: 'error',
			message: 'cookieSecure is false — auth cookies may be transmitted over HTTP',
		},
	];
}

function checkHstsWithInsecureCookies(
	isDevOrTest: boolean,
	cookieSecure: boolean
): ValidationIssue[] {
	if (cookieSecure || isDevOrTest) return [];
	return [
		{
			field: 'security.cookieSecure',
			level: 'warning',
			message: 'HSTS enabled but cookieSecure is false — set cookieSecure to true for HTTPS',
		},
	];
}

function checkPostgresSsl(
	isDevOrTest: boolean,
	dialect: 'postgres' | 'sqlite',
	sslEnabled: boolean,
	rejectUnauthorized: boolean,
	databaseUrl: string
): ValidationIssue[] {
	if (dialect !== 'postgres' || isDevOrTest) return [];
	const issues: ValidationIssue[] = [];
	if (!sslEnabled && !PG_SSLMODE_STRICT.test(databaseUrl)) {
		issues.push({
			field: 'database.ssl.enabled',
			level: 'error',
			message:
				'postgres dialect in production requires database.ssl.enabled=true ' +
				'(or sslmode=require|verify-ca|verify-full in database.url) — credentials and ' +
				'query payloads traverse the network in plaintext otherwise',
		});
	}
	if (sslEnabled && !rejectUnauthorized) {
		issues.push({
			field: 'database.ssl.rejectUnauthorized',
			level: 'warning',
			message:
				'rejectUnauthorized is false — the backend will accept any TLS certificate, ' +
				'defeating the purpose of SSL',
		});
	}
	return issues;
}

function checkUnencryptedBackups(isDevOrTest: boolean, encrypt: boolean): ValidationIssue[] {
	if (encrypt || isDevOrTest) return [];
	return [
		{
			field: 'database.backup.encrypt',
			level: 'error',
			message:
				'backup encryption disabled — backups contain user data including password hashes',
		},
	];
}

function checkEmptyAllowedOrigins(
	isDevOrTest: boolean,
	trustProxy: boolean,
	allowedOrigins: string[]
): ValidationIssue[] {
	if (!trustProxy || allowedOrigins.length > 0 || isDevOrTest) return [];
	return [
		{
			field: 'cors.allowedOrigins',
			level: 'error',
			message:
				'trustProxy enabled but allowedOrigins is empty — add custom domain to CORS origins',
		},
	];
}

function checkAllowNoOrigin(isDevOrTest: boolean, allowNoOrigin: boolean): ValidationIssue[] {
	if (!allowNoOrigin || isDevOrTest) return [];
	return [
		{
			field: 'cors.allowNoOrigin',
			level: 'error',
			message:
				'allowNoOrigin is true in production — weakens login CSRF protection. ' +
				'Disable cors.allowNoOrigin or switch to a development environment.',
		},
	];
}

function checkFrontendDevOrigins(
	isDevOrTest: boolean,
	frontendDevOrigins: string[]
): ValidationIssue[] {
	if (frontendDevOrigins.length === 0 || isDevOrTest) return [];
	return [
		{
			field: 'cors.frontendDevOrigins',
			level: 'warning',
			message: 'non-empty in production config — should be cleared for clarity',
		},
	];
}

function checkJwtExpiryFormat(isDev: boolean, security: AppConfig['security']): ValidationIssue[] {
	const issues: ValidationIssue[] = [];
	const fields = [
		{ name: 'security.jwtExpiresIn', value: security.jwtExpiresIn },
		{ name: 'security.jwtRefreshExpiresIn', value: security.jwtRefreshExpiresIn },
	];
	for (const field of fields) {
		if (!JWT_EXPIRY_PATTERN.test(field.value)) {
			issues.push({
				field: field.name,
				level: isDev ? 'warning' : 'error',
				message: `invalid format "${field.value}" — expected "15m", "1h", "7d", or "3600s"`,
			});
		}
	}
	return issues;
}

function checkWebhookUrlSsrf(webhookUrl: string): ValidationIssue[] {
	if (!webhookUrl) return [];

	let parsed: URL;
	try {
		parsed = new URL(webhookUrl);
	} catch {
		return ssrfIssue('invalid URL format');
	}

	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
		return ssrfIssue(
			`scheme '${parsed.protocol}' not allowed — only http: and https: are permitted`
		);
	}

	const hostname = parsed.hostname.toLowerCase();

	if (isLoopbackAddressOrHostname(hostname)) {
		return ssrfIssue('loopback addresses are not allowed — potential SSRF');
	}

	if (isBlockedIpv4(hostname)) {
		return ssrfIssue('private/internal IP addresses are not allowed — potential SSRF');
	}

	return [];
}

function checkAuditWhitelistProxy(trustProxy: boolean, ipWhitelist: string[]): ValidationIssue[] {
	if (!trustProxy) return [];
	const hasLoopback = ipWhitelist.some((ip) => LOOPBACK_IPS.has(ip));
	if (!hasLoopback) return [];
	return [
		{
			field: 'audit.ipWhitelist',
			level: 'warning',
			message:
				'contains loopback addresses while trustProxy is enabled — ' +
				'behind a reverse proxy, unresolved traffic from loopback would skip audit logging',
		},
	];
}

export {
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
};
