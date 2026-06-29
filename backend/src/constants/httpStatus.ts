/**
 * HTTP status codes as named constants for improved readability and maintainability.
 * Use these constants instead of magic numbers in route handlers, guards, and plugins.
 */
export const HTTP_STATUS = {
	/** Request is malformed or contains invalid data */
	BAD_REQUEST: 400,
	/** Request conflicts with existing resource state */
	CONFLICT: 409,
	/** Resource was successfully created */
	CREATED: 201,
	/** Authenticated but not authorized for this action */
	FORBIDDEN: 403,
	/** Unexpected server error */
	INTERNAL_SERVER_ERROR: 500,
	/** Request successful, no content to return */
	NO_CONTENT: 204,
	/** Requested resource does not exist */
	NOT_FOUND: 404,
	/** Server does not support this functionality */
	NOT_IMPLEMENTED: 501,
	/** Request was successful */
	OK: 200,
	/** Server is temporarily unavailable (readiness probe failure) */
	SERVICE_UNAVAILABLE: 503,
	/** Rate limit exceeded */
	TOO_MANY_REQUESTS: 429,
	/** Authentication required or failed */
	UNAUTHORIZED: 401,
	/** Request well-formed but cannot be processed due to semantic errors */
	UNPROCESSABLE_ENTITY: 422,
} as const;
