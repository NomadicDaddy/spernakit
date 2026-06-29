/** Default date range for time-scoped queries (days). */
const DATE_RANGE_DEFAULT_DAYS = 30;

/** Maximum date range for time-scoped queries (days). */
const DATE_RANGE_MAX_DAYS = 365;

/** Default maximum number of properties in a JSON/Record object. */
const MAX_PROPERTIES_DEFAULT = 50;

/** Short field length constraint (identifiers, codes, formats). */
const FIELD_LENGTH_SHORT = 50;

/** Medium field length constraint (names, titles, keys). */
const FIELD_LENGTH_MEDIUM = 100;

/* ------------------------------------------------------------------ */
/*  User field constraints                                             */
/* ------------------------------------------------------------------ */

/** Maximum length for email address fields. */
const EMAIL_MAX_LENGTH = 255;

/** Maximum length for password fields. */
const PASSWORD_MAX_LENGTH = 128;

/** Minimum length for new passwords (registration, reset, admin-create). */
const PASSWORD_MIN_LENGTH = 8;

/** Maximum length for username fields. */
const USERNAME_MAX_LENGTH = 50;

/** Minimum length for username fields. */
const USERNAME_MIN_LENGTH = 2;

/** Allowed characters for usernames: alphanumeric plus underscore, dot, hyphen. */
const USERNAME_PATTERN = '^[a-zA-Z0-9_.-]+$';

export {
	DATE_RANGE_DEFAULT_DAYS,
	DATE_RANGE_MAX_DAYS,
	EMAIL_MAX_LENGTH,
	FIELD_LENGTH_MEDIUM,
	FIELD_LENGTH_SHORT,
	MAX_PROPERTIES_DEFAULT,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
};
