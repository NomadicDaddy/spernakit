import type { ValidationIssue } from './configValidator-secrets-checks.ts';

import { isLoopbackAddressOrHostname, LOOPBACK_IPS } from '../utils/loopback.ts';
import { isBlockedIpv4 } from '../utils/urlValidator.ts';

const PG_SSLMODE_STRICT = /[?&]sslmode=(require|verify-ca|verify-full)\b/i;

function ssrfIssue(message: string): ValidationIssue[] {
	return [{ field: 'alerting.webhook.url', level: 'error', message }];
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
				'trustProxy enabled but trustedProxies is empty - allows IP spoofing via X-Forwarded-For',
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
				'(or sslmode=require|verify-ca|verify-full in database.url) - credentials and ' +
				'query payloads traverse the network in plaintext otherwise',
		});
	}
	if (sslEnabled && !rejectUnauthorized) {
		issues.push({
			field: 'database.ssl.rejectUnauthorized',
			level: 'warning',
			message:
				'rejectUnauthorized is false - the backend will accept any TLS certificate, ' +
				'defeating the purpose of SSL',
		});
	}
	return issues;
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
				'trustProxy enabled but allowedOrigins is empty - add custom domain to CORS origins',
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
				'allowNoOrigin is true in production - weakens login CSRF protection. ' +
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
			message: 'non-empty in production config - should be cleared for clarity',
		},
	];
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
			`scheme '${parsed.protocol}' not allowed - only http: and https: are permitted`
		);
	}

	const hostname = parsed.hostname.toLowerCase();
	if (isLoopbackAddressOrHostname(hostname)) {
		return ssrfIssue('loopback addresses are not allowed - potential SSRF');
	}
	if (isBlockedIpv4(hostname)) {
		return ssrfIssue('private/internal IP addresses are not allowed - potential SSRF');
	}
	return [];
}

function checkAuditWhitelistProxy(trustProxy: boolean, ipWhitelist: string[]): ValidationIssue[] {
	if (!trustProxy || !ipWhitelist.some((ip) => LOOPBACK_IPS.has(ip))) return [];
	return [
		{
			field: 'audit.ipWhitelist',
			level: 'warning',
			message:
				'contains loopback addresses while trustProxy is enabled - ' +
				'behind a reverse proxy, unresolved traffic from loopback would skip audit logging',
		},
	];
}

export {
	checkAllowNoOrigin,
	checkAuditWhitelistProxy,
	checkEmptyAllowedOrigins,
	checkFrontendDevOrigins,
	checkPostgresSsl,
	checkTrustProxy,
	checkWebhookUrlSsrf,
};
