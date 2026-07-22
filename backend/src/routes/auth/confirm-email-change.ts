import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	EMAIL_CHANGE_CONFIRM_IP_MAX_REQUESTS,
	EMAIL_CHANGE_CONFIRM_IP_WINDOW_MS,
} from '../../constants/rateLimit.ts';
import {
	RATE_LIMITED_EXAMPLE,
	SUCCESS_EXAMPLE,
	badRequestExample,
	conflictExample,
} from '../../constants/responseExamples.ts';
import { SERVICE_ERRORS } from '../../constants/serviceResults.ts';
import {
	checkRouteLimit,
	createRateLimitStore,
	isRateLimitBypassed,
} from '../../plugins/rateLimit/index.ts';
import { confirmEmailChange } from '../../services/authService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import {
	AUTH_ERROR_CODES,
	RATE_ERROR_CODES,
	badRequestError,
	conflictError,
	rateLimitError,
} from '../../utils/errorResponse.ts';

const confirmStore = createRateLimitStore();

function handleConfirmEmailChange({
	body,
	request,
	set,
}: {
	body: { token: string };
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}) {
	if (!isRateLimitBypassed()) {
		confirmStore.startCleanup();
		const ip = getClientIp(request);
		const ipResult = checkRouteLimit(
			confirmStore,
			`email-change-confirm:${ip}`,
			EMAIL_CHANGE_CONFIRM_IP_MAX_REQUESTS,
			EMAIL_CHANGE_CONFIRM_IP_WINDOW_MS
		);
		if (ipResult.limited) {
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			set.headers['Retry-After'] = String(ipResult.retryAfter ?? 0);
			return rateLimitError(ipResult.retryAfter ?? 0, RATE_ERROR_CODES.RATE_LIMIT_EXCEEDED);
		}
	}

	const result = confirmEmailChange(body.token);

	if (!result.success) {
		if (result.reason === SERVICE_ERRORS.EMAIL_TAKEN) {
			set.status = HTTP_STATUS.CONFLICT;
			return conflictError('Email address is already in use');
		}
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(
			'Invalid or expired email change token',
			AUTH_ERROR_CODES.AUTH_EMAIL_CHANGE_TOKEN_INVALID
		);
	}

	return successResponse();
}

const authConfirmEmailChangeRoutes = new Elysia({
	detail: { tags: ['Auth'] },
	prefix: '/auth',
}).post('/confirm-email-change', handleConfirmEmailChange, {
	body: t.Object({
		token: t.String({ maxLength: 512, minLength: 1 }),
	}),
	detail: {
		description:
			'Confirms a pending email change using the token delivered to the new ' +
			'address. On success, updates the account email, marks it verified, and ' +
			'revokes all user sessions (forcing re-login). Returns 400 with ' +
			'AUTH_EMAIL_CHANGE_TOKEN_INVALID if the token is expired or already used. ' +
			'Returns 409 if the target address was claimed by another account between ' +
			'request and confirmation. No authentication required.',
		responses: {
			'200': {
				content: {
					'application/json': { examples: { success: SUCCESS_EXAMPLE } },
				},
				description: 'Email change confirmed - sessions revoked.',
			},
			'400': badRequestExample(
				'Invalid or expired email change token',
				'AUTH_EMAIL_CHANGE_TOKEN_INVALID'
			),
			'409': conflictExample('Email address is already in use'),
			'429': RATE_LIMITED_EXAMPLE,
		},
		summary: 'Confirm email change with token',
	},
});

export { authConfirmEmailChangeRoutes };
