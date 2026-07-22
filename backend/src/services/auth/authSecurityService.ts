import { Type } from '../../config/configSchemaHelpers.ts';
import { AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS } from '../../constants/rateLimit.ts';
import { MS_PER_DAY } from '../../constants/scheduler.ts';
import { parseSettingsJson } from '../../utils/validation.ts';
import { getByKeyRaw, seedDefault, update } from '../settingsService.ts';

const AuthSecuritySettingsSchema = Type.Object({
	authRateLimitEnabled: Type.Optional(Type.Boolean()),
	authRateLimitMaxRequests: Type.Optional(Type.Integer({ exclusiveMinimum: 0 })),
	authRateLimitWindowMinutes: Type.Optional(Type.Integer({ exclusiveMinimum: 0 })),
	enableAccountLocking: Type.Optional(Type.Boolean()),
	lockoutDurationMinutes: Type.Optional(Type.Number()),
	maxLoginAttempts: Type.Optional(Type.Number()),
	minPasswordAgeDays: Type.Optional(Type.Number()),
	passwordExpiryDays: Type.Optional(Type.Number()),
	passwordHistoryDepth: Type.Optional(Type.Number()),
	requirePasswordChange: Type.Optional(Type.Boolean()),
	requireSpecialCharacter: Type.Optional(Type.Boolean()),
	selfRegistrationEnabled: Type.Optional(Type.Boolean()),
});

/**
 * Auth security settings interface
 */
interface AuthSecuritySettings {
	authRateLimitEnabled: boolean;
	authRateLimitMaxRequests: number;
	authRateLimitWindowMinutes: number;
	enableAccountLocking: boolean;
	lockoutDurationMinutes: number;
	maxLoginAttempts: number;
	minPasswordAgeDays: number;
	passwordExpiryDays: number;
	passwordHistoryDepth: number;
	requirePasswordChange: boolean;
	requireSpecialCharacter: boolean;
	selfRegistrationEnabled: boolean;
}

/**
 * Default auth security settings
 */
const DEFAULT_AUTH_SECURITY_SETTINGS: AuthSecuritySettings = {
	authRateLimitEnabled: true,
	authRateLimitMaxRequests: 10,
	authRateLimitWindowMinutes: 15,
	enableAccountLocking: true,
	lockoutDurationMinutes: 15,
	// Derived as AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1 so the lockout threshold sits
	// strictly ABOVE the per-account login rate limit. A known-username attacker is absorbed
	// by the rate limit (HTTP 429) before they can accumulate enough failed attempts to trip
	// the lock and terminate a victim's active session.
	maxLoginAttempts: AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS + 1,
	minPasswordAgeDays: 1,
	passwordExpiryDays: 0,
	passwordHistoryDepth: 5,
	requirePasswordChange: false,
	requireSpecialCharacter: true,
	selfRegistrationEnabled: true,
};

/** Simple TTL cache for auth security settings. TTL: 60 seconds. */
let cachedSettings: AuthSecuritySettings | null = null;
let settingsCacheExpiresAt = 0;

/**
 * Ensure auth security settings exist in database (seed if not).
 * This ensures the database is the single source of truth.
 */
function ensureAuthSettingsSeeded(): void {
	seedDefault(
		'authentication',
		DEFAULT_AUTH_SECURITY_SETTINGS,
		'Authentication security settings'
	);
}

/**
 * Get auth security settings from database.
 * Seeds default settings if not present.
 *
 * @returns Auth security settings
 */
function getAuthSettings(): AuthSecuritySettings {
	if (cachedSettings && Date.now() < settingsCacheExpiresAt) {
		return cachedSettings;
	}

	ensureAuthSettingsSeeded();

	const setting = getByKeyRaw('authentication');
	const result = parseSettingsJson(
		setting?.value ?? null,
		AuthSecuritySettingsSchema,
		DEFAULT_AUTH_SECURITY_SETTINGS,
		'auth security settings'
	);

	cachedSettings = result;
	settingsCacheExpiresAt = Date.now() + 60_000;
	return result;
}

/**
 * Update auth security settings in database.
 *
 * @param settings - New auth security settings
 * @param updatedBy - User ID making the change
 * @returns Updated setting row
 */
function updateAuthSettings(
	settings: Partial<AuthSecuritySettings>,
	updatedBy: number
): AuthSecuritySettings {
	const current = getAuthSettings();
	const merged = { ...current, ...settings };

	update({
		description: 'Authentication security settings',
		key: 'authentication',
		updatedBy,
		value: JSON.stringify(merged),
	});

	cachedSettings = null;
	settingsCacheExpiresAt = 0;
	return merged;
}

/**
 * Check if a password has expired based on password expiry settings.
 *
 * @param passwordChangedAt - Timestamp when password was last changed
 * @returns True if password has expired
 */
function isPasswordExpired(passwordChangedAt: Date | null): boolean {
	const authSettings = getAuthSettings();

	if (authSettings.passwordExpiryDays <= 0) {
		return false;
	}

	if (!passwordChangedAt) {
		// No explicit password change recorded — treat as expired when expiry is enabled
		// to force a password change on next login for accounts with stale credentials
		return true;
	}

	const expiryMs = authSettings.passwordExpiryDays * MS_PER_DAY;
	const age = Date.now() - passwordChangedAt.getTime();

	return age > expiryMs;
}

/**
 * Check if password meets minimum age requirement.
 *
 * @param passwordChangedAt - Timestamp when password was last changed
 * @returns True if password meets minimum age requirement
 */
function meetsMinPasswordAge(passwordChangedAt: Date | null): boolean {
	const authSettings = getAuthSettings();

	if (authSettings.minPasswordAgeDays <= 0) {
		return true;
	}

	if (!passwordChangedAt) {
		return true;
	}

	const minAgeMs = authSettings.minPasswordAgeDays * MS_PER_DAY;
	const age = Date.now() - passwordChangedAt.getTime();

	return age >= minAgeMs;
}

export { getAuthSettings, isPasswordExpired, meetsMinPasswordAge, updateAuthSettings };
export type { AuthSecuritySettings };
