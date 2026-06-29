import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	RATE_LIMITED_EXAMPLE,
	SUCCESS_EXAMPLE,
	badRequestExample,
} from '../../constants/responseExamples.ts';
import {
	checkRouteLimit,
	createRateLimitStore,
	isRateLimitBypassed,
} from '../../plugins/rateLimit/index.ts';
import { verifyEmail } from '../../services/authService.ts';
import { successResponse } from '../../utils/apiResponse.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import {
	AUTH_ERROR_CODES,
	RATE_ERROR_CODES,
	badRequestError,
	rateLimitError,
} from '../../utils/errorResponse.ts';

const verifyStore = createRateLimitStore();
const VERIFY_IP_MAX_REQUESTS = 20;
const VERIFY_IP_WINDOW_MS = 15 * 60 * 1000;

function handleVerifyEmail({
	body,
	request,
	set,
}: {
	body: { token: string };
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}) {
	if (!isRateLimitBypassed()) {
		verifyStore.startCleanup();
		const ip = getClientIp(request);
		const ipResult = checkRouteLimit(
			verifyStore,
			`verify-email-ip:${ip}`,
			VERIFY_IP_MAX_REQUESTS,
			VERIFY_IP_WINDOW_MS
		);
		if (ipResult.limited) {
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			set.headers['Retry-After'] = String(ipResult.retryAfter ?? 0);
			return rateLimitError(ipResult.retryAfter ?? 0, RATE_ERROR_CODES.RATE_LIMIT_EXCEEDED);
		}
	}

	const success = verifyEmail(body.token);

	if (!success) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(
			'Invalid or expired verification token',
			AUTH_ERROR_CODES.AUTH_VERIFICATION_TOKEN_INVALID
		);
	}

	return successResponse();
}

const authVerifyEmailRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' }).post(
	'/verify-email',
	handleVerifyEmail,
	{
		body: t.Object({
			token: t.String({ maxLength: 512, minLength: 1 }),
		}),
		detail: {
			description:
				'Verifies a user email address using the token from the verification email. ' +
				'Uses POST to prevent link prefetchers from consuming the token. ' +
				'Returns 400 with AUTH_VERIFICATION_TOKEN_INVALID if the token is expired ' +
				'or already used. No authentication required.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'Email verified successfully.',
				},
				'400': badRequestExample(
					'Invalid or expired verification token',
					'AUTH_VERIFICATION_TOKEN_INVALID'
				),
				'429': RATE_LIMITED_EXAMPLE,
			},
			summary: 'Verify email address with token',
		},
	}
);

export { authVerifyEmailRoutes };
