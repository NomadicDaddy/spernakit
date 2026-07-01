import type { ErrorResponse } from 'spernakit-shared';

import {
	AUTH_ERROR_CODES,
	RATE_ERROR_CODES,
	RESOURCE_ERROR_CODES,
	SERVER_ERROR_CODES,
	VALIDATION_ERROR_CODES,
} from 'spernakit-shared';

import {
	badRequestError,
	conflictError,
	forbiddenError,
	internalError,
	notFoundError,
	rateLimitError,
	serviceUnavailableError,
	unauthorizedError,
	validationError,
} from './errorResponseBuilders.ts';
import {
	extractErrorMessage,
	isMfaAlreadyEnabledError,
	isRawUniqueViolation,
	isUniqueConstraintError,
	MfaAlreadyEnabledError,
	NotFoundError,
	UniqueConstraintError,
} from './errorTypes.ts';

export type { ErrorResponse };
export {
	AUTH_ERROR_CODES,
	badRequestError,
	conflictError,
	forbiddenError,
	internalError,
	notFoundError,
	RATE_ERROR_CODES,
	rateLimitError,
	RESOURCE_ERROR_CODES,
	SERVER_ERROR_CODES,
	serviceUnavailableError,
	unauthorizedError,
	VALIDATION_ERROR_CODES,
	validationError,
};

export {
	extractErrorMessage,
	isMfaAlreadyEnabledError,
	isRawUniqueViolation,
	isUniqueConstraintError,
	MfaAlreadyEnabledError,
	NotFoundError,
	UniqueConstraintError,
};
