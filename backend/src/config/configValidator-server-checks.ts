import type { AppConfig } from './configSchema.ts';
import type { ValidationIssue } from './configValidator-secrets-checks.ts';

const DEMO_EMAILS = [
	'sysop@example.com',
	'admin@example.com',
	'manager@example.com',
	'operator@example.com',
	'viewer@example.com',
];
const DEMO_PASSWORDS = ['sysop123', 'admin123', 'manager123', 'operator123', 'viewer123'];
const JWT_EXPIRY_PATTERN = /^\d+[dhms]$/;
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
				: 'rate limiting disabled - exposes application to DoS attacks',
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
				: 'auth rate limiting disabled - exposes authentication endpoints to brute-force attacks',
		},
	];
}

function checkInsecureCookies(isDevOrTest: boolean, cookieSecure: boolean): ValidationIssue[] {
	if (cookieSecure || isDevOrTest) return [];
	return [
		{
			field: 'security.cookieSecure',
			level: 'error',
			message: 'cookieSecure is false - auth cookies may be transmitted over HTTP',
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
			message: 'HSTS enabled but cookieSecure is false - set cookieSecure to true for HTTPS',
		},
	];
}

function checkUnencryptedBackups(isDevOrTest: boolean, encrypt: boolean): ValidationIssue[] {
	if (encrypt || isDevOrTest) return [];
	return [
		{
			field: 'database.backup.encrypt',
			level: 'error',
			message:
				'backup encryption disabled - backups contain user data including password hashes',
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
				message: `invalid format "${field.value}" - expected "15m", "1h", "7d", or "3600s"`,
			});
		}
	}
	return issues;
}

export {
	checkAuthRateLimitConfig,
	checkDemoCredentials,
	checkHstsWithInsecureCookies,
	checkInsecureCookies,
	checkJwtExpiryFormat,
	checkRateLimitConfig,
	checkUnencryptedBackups,
};
