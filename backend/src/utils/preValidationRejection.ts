import type { ErrorResponse } from 'spernakit-shared';

/**
 * A rejection raised from a transform-stage hook, before Elysia validates the request body.
 *
 * Elysia runs its lifecycle in the order transform, validation, beforeHandle, handler. A guard
 * that lives in `beforeHandle` therefore runs *after* the body has been checked against the
 * route's schema, so an anonymous caller who posts a malformed body is answered with a 400 that
 * describes the schema instead of the 401 the route actually owes them. The only way to reject a
 * request ahead of validation is to throw from a transform hook: returning a value there is
 * ignored and validation still runs.
 *
 * A bare `throw` would surface as a 500, so the rejection carries the response it wants. The
 * `onError` handler in `create-api-app.ts` recognises this class ahead of every other code,
 * applies the status and headers, and returns the body unchanged, which keeps the standard
 * `ErrorResponse` envelope identical to the one the same guard produced from `beforeHandle`.
 *
 * This is a control-flow signal, not a fault. Nothing logs it as an error.
 */
class PreValidationRejection extends Error {
	/** The response body to return, already in the standard error envelope. */
	readonly body: ErrorResponse;
	/** Headers the rejection needs on the response, such as `Retry-After` on a 429. */
	readonly headers: Record<string, string>;
	/** The HTTP status the rejection is answered with. */
	readonly httpStatus: number;

	constructor(httpStatus: number, body: ErrorResponse, headers: Record<string, string> = {}) {
		super('Request rejected before validation');
		this.name = 'PreValidationRejection';
		this.httpStatus = httpStatus;
		this.body = body;
		this.headers = headers;
	}
}

/**
 * Narrow an unknown error to a pre-validation rejection.
 *
 * @param error - The value `onError` received.
 * @returns Whether it is a rejection raised before validation.
 */
function isPreValidationRejection(error: unknown): error is PreValidationRejection {
	return error instanceof PreValidationRejection;
}

export { isPreValidationRejection, PreValidationRejection };
