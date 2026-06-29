import {
	API_KEY_SCOPE_LABELS,
	API_KEY_SCOPES,
	type ApiKeyScope,
	type UserRole,
} from 'spernakit-shared';

/** User as returned from the API */
interface User {
	createdAt: string;
	email: string;
	failedLoginAttempts: null | number;
	id: number;
	lastLoginAt: null | string;
	lockedUntil: null | string;
	role: UserRole;
	updatedAt: string;
	username: string;
}

/** Display configuration for a single role */
interface RoleDisplay {
	description: string;
	label: string;
}

/** Map of role keys to their display configuration */
type RoleLabels = Record<UserRole, RoleDisplay>;

/** API key as returned from list endpoint */
interface ApiKey {
	createdAt: string;
	createdBy: number;
	expiresAt: null | string;
	id: number;
	isActive: boolean;
	keyName: string;
	keyScope: ApiKeyScope;
	lastUsedAt: null | string;
}

/** API key creation response (key + secret shown only once) */
interface ApiKeyCreateResponse {
	apiKey: string;
	apiKeySecret: string;
	keyData: ApiKey;
}

/** Security health report user entry */
interface SecurityHealthUser {
	email: string;
	id: number;
	issues: string[];
	username: string;
}

/** Security health report from /auth/security-health */
interface SecurityHealthReport {
	authSettings: {
		enableAccountLocking: boolean;
		lockoutDurationMinutes: number;
		maxLoginAttempts: number;
		minPasswordAgeDays: number;
		passwordExpiryDays: number;
		requirePasswordChange: boolean;
	};
	users: SecurityHealthUser[];
}

export type {
	ApiKey,
	ApiKeyCreateResponse,
	ApiKeyScope,
	RoleLabels,
	SecurityHealthReport,
	SecurityHealthUser,
	User,
	UserRole,
};

export { API_KEY_SCOPE_LABELS, API_KEY_SCOPES };
