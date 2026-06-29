import type { AppConfig } from './configSchema.ts';

import {
	collectSecretIssues,
	getSecretFields,
	getPemKeyFields,
	type ValidationIssue,
	validateEncryptionKeyFormat,
	validateKnownDevKeys,
	validateMfaKeyPair,
	validatePemKeys,
	validatePlaceholderSecrets,
	validateSecretStrength,
} from './configValidator-secrets.ts';
import {
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
} from './configValidator-server.ts';

/**
 * Validate security requirements at server startup.
 * Logs issues via configLogger and calls process.exit(1) on errors.
 */
function validateSecurityRequirements(validated: AppConfig): void {
	const nodeEnv = validated.server.nodeEnv;
	const secretFields = getSecretFields(validated);
	const pemKeyFields = getPemKeyFields(validated);

	validatePlaceholderSecrets(nodeEnv, secretFields);
	validateSecretStrength(nodeEnv, secretFields);
	validatePemKeys(nodeEnv, pemKeyFields);
	validateMfaKeyPair(nodeEnv, validated.security);
	validateKnownDevKeys(nodeEnv, validated.security);
	validateEncryptionKeyFormat(nodeEnv, validated.security.encryptionKey);
	validateDemoCredentials(nodeEnv, validated.testing);
	warnDisabledRateLimit(nodeEnv, validated.rateLimit.enabled);
	warnDisabledAuthRateLimit(nodeEnv, validated.rateLimit.authEnabled);
	warnUnsafeTrustProxy(nodeEnv, validated.server.trustProxy, validated.server.trustedProxies);
	warnInsecureCookies(nodeEnv, validated.security.cookieSecure);
	warnHstsWithInsecureCookies(nodeEnv, validated.security.cookieSecure);
	warnUnencryptedBackups(nodeEnv, validated.database.backup.encrypt);
	warnPostgresSsl(nodeEnv, validated.database);
	warnEmptyAllowedOrigins(nodeEnv, validated.server.trustProxy, validated.cors.allowedOrigins);
	warnAllowNoOrigin(nodeEnv, validated.cors.allowNoOrigin);
	warnFrontendDevOriginsInProduction(nodeEnv, validated.cors.frontendDevOrigins);
	warnAuditWhitelistProxy(validated.server.trustProxy, validated.audit.ipWhitelist);
	validateJwtExpiryFormat(nodeEnv, validated.security);
	warnWebhookUrlSsrf(validated.alerting.webhook.url);
}

/**
 * Collect all security validation issues as data.
 * Used by config:validate script for standalone validation without process.exit.
 */
function collectSecurityIssues(validated: AppConfig): ValidationIssue[] {
	const nodeEnv = validated.server.nodeEnv;
	const secretFields = getSecretFields(validated);
	const pemKeyFields = getPemKeyFields(validated);

	return [
		...collectSecretIssues(nodeEnv, secretFields, pemKeyFields, validated.security),
		...collectServerIssues(nodeEnv, validated),
	];
}

export { collectSecurityIssues, type ValidationIssue, validateSecurityRequirements };
