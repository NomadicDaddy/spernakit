import type { ErrorCode, ErrorResponse } from 'spernakit-shared';

import {
	AUTH_ERROR_CODES,
	RATE_ERROR_CODES,
	RESOURCE_ERROR_CODES,
	SERVER_ERROR_CODES,
	VALIDATION_ERROR_CODES,
} from 'spernakit-shared';

const ErrorTitle = {
	BAD_REQUEST: 'Bad request',
	CONFLICT: 'Conflict',
	FORBIDDEN: 'Forbidden',
	INTERNAL_ERROR: 'Internal server error',
	NOT_FOUND: 'Not found',
	RATE_LIMITED: 'Too many requests',
	SERVICE_UNAVAILABLE: 'Service unavailable',
	UNAUTHORIZED: 'Unauthorized',
	VALIDATION_FAILED: 'Validation failed',
} as const;

function createErrorResponse(
	error: string,
	code: ErrorCode,
	message: string,
	requestId?: string,
	details?: Record<string, unknown>
): ErrorResponse {
	const response: ErrorResponse = {
		code,
		error,
		message,
	};

	if (requestId) {
		response.requestId = requestId;
	}

	if (details && Object.keys(details).length > 0) {
		response.details = details;
	}

	return response;
}

function unauthorizedError(
	message = 'Authentication required',
	code: ErrorCode = AUTH_ERROR_CODES.AUTH_TOKEN_MISSING,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(ErrorTitle.UNAUTHORIZED, code, message, requestId);
}

function forbiddenError(
	message = 'Access denied',
	code: ErrorCode = AUTH_ERROR_CODES.AUTH_PERMISSION_DENIED,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(ErrorTitle.FORBIDDEN, code, message, requestId);
}

function notFoundError(
	resource: string,
	code: ErrorCode = RESOURCE_ERROR_CODES.RESOURCE_NOT_FOUND,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(ErrorTitle.NOT_FOUND, code, `${resource} not found`, requestId);
}

function validationError(
	message: string,
	code: ErrorCode = VALIDATION_ERROR_CODES.VALIDATION_FAILED,
	requestId?: string,
	details?: Record<string, unknown>
): ErrorResponse {
	return createErrorResponse(ErrorTitle.VALIDATION_FAILED, code, message, requestId, details);
}

function rateLimitError(
	retryAfterSeconds: number,
	code: ErrorCode = RATE_ERROR_CODES.RATE_LIMIT_EXCEEDED,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(
		ErrorTitle.RATE_LIMITED,
		code,
		`Rate limit exceeded. Try again in ${retryAfterSeconds} seconds.`,
		requestId,
		{ retryAfter: retryAfterSeconds }
	);
}

function conflictError(
	message: string,
	code: ErrorCode = RESOURCE_ERROR_CODES.RESOURCE_ALREADY_EXISTS,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(ErrorTitle.CONFLICT, code, message, requestId);
}

function internalError(
	code: ErrorCode = SERVER_ERROR_CODES.SERVER_INTERNAL_ERROR,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(
		ErrorTitle.INTERNAL_ERROR,
		code,
		'An unexpected error occurred',
		requestId
	);
}

function serviceUnavailableError(
	message: string,
	code: ErrorCode = SERVER_ERROR_CODES.SERVER_INTERNAL_ERROR,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(ErrorTitle.SERVICE_UNAVAILABLE, code, message, requestId);
}

function badRequestError(
	message: string,
	code: ErrorCode = VALIDATION_ERROR_CODES.VALIDATION_FAILED,
	requestId?: string
): ErrorResponse {
	return createErrorResponse(ErrorTitle.BAD_REQUEST, code, message, requestId);
}

export {
	badRequestError,
	conflictError,
	forbiddenError,
	internalError,
	notFoundError,
	rateLimitError,
	serviceUnavailableError,
	unauthorizedError,
	validationError,
};
