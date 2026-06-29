/** Interval in milliseconds for cleaning up expired rate limit entries (1 minute) */
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 60_000;

/** Maximum auth attempts per account per window (distributed brute-force defense) */
const AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS = 10;

/** Account-level auth rate limit window in milliseconds (15 minutes) */
const AUTH_ACCOUNT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

/** Maximum registration attempts per window per IP */
const REGISTRATION_RATE_LIMIT_MAX_REQUESTS = 5;

/** Registration rate limit window duration in milliseconds (1 hour) */
const REGISTRATION_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

/** Maximum password reset requests per IP per window */
const PASSWORD_RESET_IP_MAX_REQUESTS = 5;

/** Password reset IP rate limit window in milliseconds (15 minutes) */
const PASSWORD_RESET_IP_WINDOW_MS = 15 * 60 * 1000;

/** Maximum OAuth callback requests per IP per window */
const OAUTH_CALLBACK_IP_MAX_REQUESTS = 10;

/** OAuth callback IP rate limit window in milliseconds (15 minutes) */
const OAUTH_CALLBACK_IP_WINDOW_MS = 15 * 60 * 1000;

/** Maximum password reset confirm (token submit) requests per IP per window */
const PASSWORD_RESET_CONFIRM_IP_MAX_REQUESTS = 10;

/** Password reset confirm IP rate limit window in milliseconds (15 minutes) */
const PASSWORD_RESET_CONFIRM_IP_WINDOW_MS = 15 * 60 * 1000;

/** Maximum password reset requests per email per window */
const PASSWORD_RESET_EMAIL_MAX_REQUESTS = 3;

/** Password reset email rate limit window in milliseconds (1 hour) */
const PASSWORD_RESET_EMAIL_WINDOW_MS = 60 * 60 * 1000;

/** Maximum email-change confirm (token submit) requests per IP per window */
const EMAIL_CHANGE_CONFIRM_IP_MAX_REQUESTS = 10;

/** Email-change confirm IP rate limit window in milliseconds (15 minutes) */
const EMAIL_CHANGE_CONFIRM_IP_WINDOW_MS = 15 * 60 * 1000;

export {
	AUTH_ACCOUNT_RATE_LIMIT_MAX_REQUESTS,
	AUTH_ACCOUNT_RATE_LIMIT_WINDOW_MS,
	EMAIL_CHANGE_CONFIRM_IP_MAX_REQUESTS,
	EMAIL_CHANGE_CONFIRM_IP_WINDOW_MS,
	OAUTH_CALLBACK_IP_MAX_REQUESTS,
	OAUTH_CALLBACK_IP_WINDOW_MS,
	PASSWORD_RESET_CONFIRM_IP_MAX_REQUESTS,
	PASSWORD_RESET_CONFIRM_IP_WINDOW_MS,
	PASSWORD_RESET_EMAIL_MAX_REQUESTS,
	PASSWORD_RESET_EMAIL_WINDOW_MS,
	PASSWORD_RESET_IP_MAX_REQUESTS,
	PASSWORD_RESET_IP_WINDOW_MS,
	RATE_LIMIT_CLEANUP_INTERVAL_MS,
	REGISTRATION_RATE_LIMIT_MAX_REQUESTS,
	REGISTRATION_RATE_LIMIT_WINDOW_MS,
};
