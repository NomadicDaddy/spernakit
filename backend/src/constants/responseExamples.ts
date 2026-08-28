/**
 * Shared OpenAPI response examples for Swagger documentation.
 *
 * These examples are used in `detail.responses` across route definitions to provide
 * realistic response samples in the Swagger UI. They follow the OpenAPI 3.x
 * ExampleObject format: { summary, value }.
 *
 * The success-envelope helpers live in `successExamples.ts` and are re-exported here, so a route
 * imports every example it needs from this one module regardless of which half it came from.
 */

import { MISSING_WORKSPACE_HEADER, WORKSPACE_HEADER } from '../guards/workspaceHeader.ts';

/* -------------------------------------------------------------------------- */
/*  Return types for response example helpers                                 */
/* -------------------------------------------------------------------------- */

interface ErrorExampleValue {
	code: string;
	error: string;
	message: string;
}

interface ErrorResponseExample {
	content: {
		'application/json': {
			examples: Record<string, { summary: string; value: ErrorExampleValue }>;
		};
	};
	description: string;
}

/* -------------------------------------------------------------------------- */
/*  Common error response examples                                            */
/* -------------------------------------------------------------------------- */

/** 401 Unauthorized — missing or invalid auth token. */
const UNAUTHORIZED_EXAMPLE = {
	content: {
		'application/json': {
			examples: {
				tokenInvalid: {
					summary: 'Access token is malformed or expired',
					value: {
						code: 'AUTH_TOKEN_INVALID',
						error: 'Unauthorized',
						message: 'Invalid access token',
					},
				},
				tokenMissing: {
					summary: 'No auth cookie present',
					value: {
						code: 'AUTH_TOKEN_MISSING',
						error: 'Unauthorized',
						message: 'Authentication required',
					},
				},
			},
		},
	},
	description: 'Authentication required or token is invalid/expired.',
};

/** 403 Forbidden — insufficient role. */
const FORBIDDEN_EXAMPLE = {
	content: {
		'application/json': {
			examples: {
				permissionDenied: {
					summary: 'Role does not meet minimum requirement',
					value: {
						code: 'AUTH_PERMISSION_DENIED',
						error: 'Forbidden',
						message: 'Access denied',
					},
				},
			},
		},
	},
	description: 'Insufficient permissions for this operation.',
};

/**
 * 404 Not Found — generic resource.
 * @param resource
 * @returns OpenAPI response object for 404 Not Found
 */
function notFoundExample(resource: string): ErrorResponseExample {
	return {
		content: {
			'application/json': {
				examples: {
					notFound: {
						summary: `${resource} does not exist`,
						value: {
							code: 'RESOURCE_NOT_FOUND',
							error: 'Not found',
							message: `${resource} not found`,
						},
					},
				},
			},
		},
		description: `${resource} not found.`,
	};
}

/**
 * 400 Bad Request — validation failure.
 * @param message
 * @param code
 * @returns OpenAPI response object for 400 Bad Request
 */
function badRequestExample(message: string, code = 'VALIDATION_FAILED'): ErrorResponseExample {
	return {
		content: {
			'application/json': {
				examples: {
					badRequest: {
						summary: 'Request validation failed',
						value: {
							code,
							error: 'Bad request',
							message,
						},
					},
				},
			},
		},
		description: 'Invalid request parameters or body.',
	};
}

/**
 * 409 Conflict — resource already exists.
 * @param message
 * @returns OpenAPI response object for 409 Conflict
 */
function conflictExample(message: string): ErrorResponseExample {
	return {
		content: {
			'application/json': {
				examples: {
					conflict: {
						summary: 'Resource already exists or conflicts',
						value: {
							code: 'RESOURCE_ALREADY_EXISTS',
							error: 'Conflict',
							message,
						},
					},
				},
			},
		},
		description: 'Resource conflict.',
	};
}

/**
 * 400 Bad Request - the route needs a workspace and the request named none.
 *
 * The message is the guard's own, imported rather than retyped, so the documented reply and the
 * real one cannot drift apart. A route that answers 400 for a reason of its own passes that message
 * in and gets both cases; the workspace case is always present, which is the point of having one
 * builder rather than each route remembering to mention it.
 *
 * @param alsoMessage - A further 400 this route can answer with, such as a failed field check.
 * @param code - The error code carried by that further case.
 * @returns OpenAPI response object for 400 Bad Request.
 */
function missingWorkspaceHeaderExample(
	alsoMessage?: string,
	code = 'VALIDATION_FAILED',
): ErrorResponseExample {
	return {
		content: {
			'application/json': {
				examples: {
					...(alsoMessage
						? {
								badRequest: {
									summary: 'Request validation failed',
									value: { code, error: 'Bad request', message: alsoMessage },
								},
							}
						: {}),
					missingWorkspaceHeader: {
						summary: 'The request named no workspace',
						value: {
							code: 'VALIDATION_FAILED',
							error: 'Bad request',
							message: MISSING_WORKSPACE_HEADER,
						},
					},
				},
			},
		},
		description: `Invalid request parameters, or no workspace named by the ${WORKSPACE_HEADER} header.`,
	};
}

/** 429 Rate limited. */
const RATE_LIMITED_EXAMPLE = {
	content: {
		'application/json': {
			examples: {
				rateLimited: {
					summary: 'Rate limit exceeded',
					value: {
						code: 'RATE_LIMIT_EXCEEDED',
						details: { retryAfter: 60 },
						error: 'Too many requests',
						message: 'Rate limit exceeded. Try again in 60 seconds.',
					},
				},
			},
		},
	},
	description: 'Too many requests - rate limit exceeded.',
};

/** 500 Internal Server Error. */
const INTERNAL_ERROR_EXAMPLE = {
	content: {
		'application/json': {
			examples: {
				internalError: {
					summary: 'Unexpected server error',
					value: {
						code: 'SERVER_INTERNAL_ERROR',
						error: 'Internal server error',
						message: 'An unexpected error occurred',
					},
				},
			},
		},
	},
	description: 'Unexpected server error.',
};

export { dataExample, paginatedExample, SUCCESS_EXAMPLE } from './successExamples.ts';

export {
	badRequestExample,
	conflictExample,
	FORBIDDEN_EXAMPLE,
	INTERNAL_ERROR_EXAMPLE,
	missingWorkspaceHeaderExample,
	notFoundExample,
	RATE_LIMITED_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
};
