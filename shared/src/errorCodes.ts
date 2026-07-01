/**
 * Standardized application-level error codes for the API.
 *
 * These codes allow clients to programmatically handle specific error conditions
 * without parsing error message strings. Each error code maps to a specific
 * error condition and HTTP status code.
 *
 * Error code format: CATEGORY_SPECIFIC_ERROR
 * - AUTH_*: Authentication and authorization errors
 * - VALIDATION_*: Input validation errors
 * - RESOURCE_*: Resource state errors
 * - RATE_*: Rate limiting errors
 * - SERVER_*: Server-side errors
 */

/**
 * Authentication and authorization error codes.
 * HTTP status: 401 (Unauthorized) or 403 (Forbidden)
 */
const AUTH_ERROR_CODES = {
	/** User account has been deleted */
	AUTH_ACCOUNT_DELETED: 'AUTH_ACCOUNT_DELETED',
	/** User account is locked due to too many failed attempts */
	AUTH_ACCOUNT_LOCKED: 'AUTH_ACCOUNT_LOCKED',

	/** API key nonce was already used (replay attack) */
	AUTH_API_KEY_NONCE_REUSED: 'AUTH_API_KEY_NONCE_REUSED',

	/** API key signature is invalid */
	AUTH_API_KEY_SIGNATURE_INVALID: 'AUTH_API_KEY_SIGNATURE_INVALID',

	/** API key timestamp is too old (replay protection) */
	AUTH_API_KEY_TIMESTAMP_INVALID: 'AUTH_API_KEY_TIMESTAMP_INVALID',

	/** Cross-origin request rejected for unauthenticated state-changing endpoint */
	AUTH_CSRF_ORIGIN_REJECTED: 'AUTH_CSRF_ORIGIN_REJECTED',

	/** CSRF token is invalid or missing */
	AUTH_CSRF_TOKEN_INVALID: 'AUTH_CSRF_TOKEN_INVALID',

	/** Email change confirmation token is invalid or expired */
	AUTH_EMAIL_CHANGE_TOKEN_INVALID: 'AUTH_EMAIL_CHANGE_TOKEN_INVALID',

	/** Credentials (username/password) are invalid */
	AUTH_INVALID_CREDENTIALS: 'AUTH_INVALID_CREDENTIALS',

	/** MFA is already enabled on this account */
	AUTH_MFA_ALREADY_ENABLED: 'AUTH_MFA_ALREADY_ENABLED',

	/** MFA code is invalid or expired */
	AUTH_MFA_INVALID_CODE: 'AUTH_MFA_INVALID_CODE',

	/** Server has no MFA signing key configured — MFA cannot be enabled */
	AUTH_MFA_NOT_CONFIGURED: 'AUTH_MFA_NOT_CONFIGURED',

	/** MFA challenge token is invalid or expired */
	AUTH_MFA_TOKEN_INVALID: 'AUTH_MFA_TOKEN_INVALID',

	/** OAuth provider returned an error */
	AUTH_OAUTH_FAILED: 'AUTH_OAUTH_FAILED',

	/** OAuth state parameter is invalid or expired */
	AUTH_OAUTH_STATE_INVALID: 'AUTH_OAUTH_STATE_INVALID',

	/** User must change their password before accessing other resources */
	AUTH_PASSWORD_CHANGE_REQUIRED: 'AUTH_PASSWORD_CHANGE_REQUIRED',

	/** User's password has expired and must be reset */
	AUTH_PASSWORD_EXPIRED: 'AUTH_PASSWORD_EXPIRED',

	/** User does not have required role/permission */
	AUTH_PERMISSION_DENIED: 'AUTH_PERMISSION_DENIED',

	/** Self-registration is disabled by administrator */
	AUTH_REGISTRATION_DISABLED: 'AUTH_REGISTRATION_DISABLED',

	/** Password reset token is invalid or expired */
	AUTH_RESET_TOKEN_INVALID: 'AUTH_RESET_TOKEN_INVALID',

	/** Access token has expired */
	AUTH_TOKEN_EXPIRED: 'AUTH_TOKEN_EXPIRED',

	/** Token format is invalid or malformed */
	AUTH_TOKEN_INVALID: 'AUTH_TOKEN_INVALID',

	/** No authentication token provided */
	AUTH_TOKEN_MISSING: 'AUTH_TOKEN_MISSING',

	/** Refresh token has been revoked or reused */
	AUTH_TOKEN_REVOKED: 'AUTH_TOKEN_REVOKED',

	/** Email verification token is invalid or expired */
	AUTH_VERIFICATION_TOKEN_INVALID: 'AUTH_VERIFICATION_TOKEN_INVALID',
	/** User does not have access to workspace */
	AUTH_WORKSPACE_ACCESS_DENIED: 'AUTH_WORKSPACE_ACCESS_DENIED',
} as const;

/**
 * Input validation error codes.
 * HTTP status: 400 (Bad Request)
 */
const VALIDATION_ERROR_CODES = {
	/** Generic validation failure */
	VALIDATION_FAILED: 'VALIDATION_FAILED',
	/** Email format is invalid */
	VALIDATION_INVALID_EMAIL: 'VALIDATION_INVALID_EMAIL',
	/** Field value is invalid format */
	VALIDATION_INVALID_FORMAT: 'VALIDATION_INVALID_FORMAT',
	/** Pagination parameters are invalid */
	VALIDATION_INVALID_PAGINATION: 'VALIDATION_INVALID_PAGINATION',
	/** Field value exceeds maximum length */
	VALIDATION_MAX_LENGTH: 'VALIDATION_MAX_LENGTH',
	/** Field value is below minimum length */
	VALIDATION_MIN_LENGTH: 'VALIDATION_MIN_LENGTH',
	/** Field value is out of allowed range */
	VALIDATION_OUT_OF_RANGE: 'VALIDATION_OUT_OF_RANGE',
	/** Required field is missing */
	VALIDATION_REQUIRED_FIELD: 'VALIDATION_REQUIRED_FIELD',
	/** Password does not meet requirements */
	VALIDATION_WEAK_PASSWORD: 'VALIDATION_WEAK_PASSWORD',
} as const;

/**
 * Resource state error codes.
 * HTTP status: 404 (Not Found) or 409 (Conflict)
 */
const RESOURCE_ERROR_CODES = {
	/** Resource with same identifier already exists */
	RESOURCE_ALREADY_EXISTS: 'RESOURCE_ALREADY_EXISTS',
	/** Requested resource does not exist */
	RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
	/** Resource storage has reached maximum capacity */
	RESOURCE_STORAGE_FULL: 'RESOURCE_STORAGE_FULL',
} as const;

/**
 * Rate limiting error codes.
 * HTTP status: 429 (Too Many Requests)
 */
const RATE_ERROR_CODES = {
	/** API endpoint rate limit exceeded */
	RATE_API_LIMIT_EXCEEDED: 'RATE_API_LIMIT_EXCEEDED',
	/** Generic rate limit exceeded */
	RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
	/** Login attempt rate limit exceeded */
	RATE_LOGIN_LIMIT_EXCEEDED: 'RATE_LOGIN_LIMIT_EXCEEDED',
	/** OAuth callback rate limit exceeded */
	RATE_OAUTH_CALLBACK_LIMIT_EXCEEDED: 'RATE_OAUTH_CALLBACK_LIMIT_EXCEEDED',
	/** Password reset attempt rate limit exceeded */
	RATE_PASSWORD_RESET_LIMIT_EXCEEDED: 'RATE_PASSWORD_RESET_LIMIT_EXCEEDED',
	/** Registration attempt rate limit exceeded */
	RATE_REGISTRATION_LIMIT_EXCEEDED: 'RATE_REGISTRATION_LIMIT_EXCEEDED',
} as const;

/**
 * Server-side error codes.
 * HTTP status: 500 (Internal Server Error) or 503 (Service Unavailable)
 */
const SERVER_ERROR_CODES = {
	/** Unexpected internal error */
	SERVER_INTERNAL_ERROR: 'SERVER_INTERNAL_ERROR',
} as const;

const ERROR_CODES = {
	...AUTH_ERROR_CODES,
	...RATE_ERROR_CODES,
	...RESOURCE_ERROR_CODES,
	...SERVER_ERROR_CODES,
	...VALIDATION_ERROR_CODES,
} as const;

/** Type representing a valid error code string */
type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export {
	AUTH_ERROR_CODES,
	ERROR_CODES,
	RATE_ERROR_CODES,
	RESOURCE_ERROR_CODES,
	SERVER_ERROR_CODES,
	VALIDATION_ERROR_CODES,
};
export type { ErrorCode };
