/**
 * Machine-readable result codes returned by service functions.
 *
 * Routes compare against these constants instead of free-form string literals
 * so that service-layer message rewording does not silently break control flow.
 */
export const SERVICE_ERRORS = {
	EMAIL_TAKEN: 'email_taken',
	INVALID_CREDENTIALS: 'invalid_credentials',
	INVALID_PASSWORD: 'invalid_password',
	PASSWORD_AGE: 'password_age',
	PASSWORD_HISTORY: 'password_history',
	SMTP_NOT_CONFIGURED: 'not_configured',
	TASK_NOT_FOUND: 'task_not_found',
	TOKEN_INVALID: 'token_invalid',
	USER_NOT_FOUND: 'user_not_found',
} as const;
