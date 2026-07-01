/** Milliseconds per second */
const MS_PER_SECOND = 1000;

/** Seconds per minute */
const SECONDS_PER_MINUTE = 60;

/** Minutes per hour */
const MINUTES_PER_HOUR = 60;

/** Hours per day */
const HOURS_PER_DAY = 24;

/** Milliseconds per minute (60 * 1000) */
const MS_PER_MINUTE = SECONDS_PER_MINUTE * MS_PER_SECOND;

/** Milliseconds per hour (60 * 60 * 1000) */
const MS_PER_HOUR = MINUTES_PER_HOUR * MS_PER_MINUTE;

/** Milliseconds per day (24 * 60 * 60 * 1000) */
const MS_PER_DAY = HOURS_PER_DAY * MS_PER_HOUR;

/** Health check execution interval (minutes) */
const HEALTH_CHECK_EXECUTION_INTERVAL_MINUTES = 5;

/** Health check cleanup interval (hours) */
const HEALTH_CHECK_CLEANUP_INTERVAL_HOURS = 24;

/** Audit log archive interval (hours) - weekly */
const AUDIT_LOG_ARCHIVE_INTERVAL_HOURS = 168;

/** Business events cleanup interval (hours) - weekly */
const BUSINESS_EVENTS_CLEANUP_INTERVAL_HOURS = 168;

/** Soft-deleted file storage purge interval (hours) - daily */
const SOFT_DELETED_FILES_CLEANUP_INTERVAL_HOURS = 24;

/** Soft-deleted notifications purge interval (hours) - daily */
const NOTIFICATIONS_CLEANUP_INTERVAL_HOURS = 24;

/** System metrics cleanup interval (hours) */
const SYSTEM_METRICS_CLEANUP_INTERVAL_HOURS = 24;

/** System metrics retention (days) */
const SYSTEM_METRICS_RETENTION_DAYS = 30;

/** Web vitals retention (days) */
const WEB_VITALS_RETENTION_DAYS = 7;

/** Days of inactivity before a user's refresh token is considered stale */
const STALE_USER_LOGIN_DAYS = 30;

/** Database VACUUM interval (hours) - weekly */
const DATABASE_VACUUM_INTERVAL_HOURS = 168;

/** Maximum number of records to process in a single cleanup batch */
const MAX_CLEANUP_BATCH_SIZE = 50;

export {
	AUDIT_LOG_ARCHIVE_INTERVAL_HOURS,
	BUSINESS_EVENTS_CLEANUP_INTERVAL_HOURS,
	DATABASE_VACUUM_INTERVAL_HOURS,
	HEALTH_CHECK_CLEANUP_INTERVAL_HOURS,
	HEALTH_CHECK_EXECUTION_INTERVAL_MINUTES,
	MAX_CLEANUP_BATCH_SIZE,
	MS_PER_DAY,
	MS_PER_HOUR,
	MS_PER_MINUTE,
	NOTIFICATIONS_CLEANUP_INTERVAL_HOURS,
	SOFT_DELETED_FILES_CLEANUP_INTERVAL_HOURS,
	STALE_USER_LOGIN_DAYS,
	SYSTEM_METRICS_CLEANUP_INTERVAL_HOURS,
	SYSTEM_METRICS_RETENTION_DAYS,
	WEB_VITALS_RETENTION_DAYS,
};
