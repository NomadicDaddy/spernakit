import { Elysia, t } from 'elysia';

import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	REGISTRATION_RATE_LIMIT_MAX_REQUESTS,
	REGISTRATION_RATE_LIMIT_WINDOW_MS,
} from '../../constants/rateLimit.ts';
import {
	dataExample,
	RATE_LIMITED_EXAMPLE,
	SUCCESS_EXAMPLE,
} from '../../constants/responseExamples.ts';
import {
	EMAIL_MAX_LENGTH,
	PASSWORD_MAX_LENGTH,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
} from '../../constants/validation.ts';
import { csrfPlugin } from '../../plugins/csrf.ts';
import {
	checkRouteLimit,
	createRateLimitStore,
	isRateLimitBypassed,
} from '../../plugins/rateLimit/index.ts';
import { generateEmailVerificationToken, getAuthSettings } from '../../services/authService.ts';
import { sendVerificationEmail } from '../../services/emailService.ts';
import { trackEvent } from '../../services/metricsService.ts';
import { createUser, hardDeleteUserForRollback } from '../../services/userService.ts';
import { addMemberToDefaultWorkspace } from '../../services/workspaceService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { validatePasswordStrength } from '../../utils/auth/passwordValidation.ts';
import { getClientIp } from '../../utils/clientIp.ts';
import {
	AUTH_ERROR_CODES,
	badRequestError,
	forbiddenError,
	isUniqueConstraintError,
	RATE_ERROR_CODES,
	rateLimitError,
	VALIDATION_ERROR_CODES,
} from '../../utils/errorResponse.ts';
import { logger } from '../../utils/logger.ts';

const registrationStore = createRateLimitStore();

interface RegisterBody {
	confirmPassword: string;
	email: string;
	password: string;
	username: string;
}

interface RegisterContext {
	body: RegisterBody;
	request: Request;
	set: { headers: Record<string, number | string>; status?: number | string };
}

function checkRegistrationPrerequisites(
	{ request, set }: Pick<RegisterContext, 'request' | 'set'>,
	authSettings: ReturnType<typeof getAuthSettings>
) {
	if (!authSettings.selfRegistrationEnabled) {
		set.status = HTTP_STATUS.FORBIDDEN;
		return forbiddenError(
			'Self-registration is currently disabled',
			AUTH_ERROR_CODES.AUTH_REGISTRATION_DISABLED
		);
	}

	if (!isRateLimitBypassed()) {
		registrationStore.startCleanup();
		const ip = getClientIp(request);
		const result = checkRouteLimit(
			registrationStore,
			`register-ip:${ip}`,
			REGISTRATION_RATE_LIMIT_MAX_REQUESTS,
			REGISTRATION_RATE_LIMIT_WINDOW_MS
		);
		if (result.limited) {
			set.status = HTTP_STATUS.TOO_MANY_REQUESTS;
			set.headers['Retry-After'] = String(result.retryAfter ?? 0);
			return rateLimitError(
				result.retryAfter ?? 0,
				RATE_ERROR_CODES.RATE_REGISTRATION_LIMIT_EXCEEDED
			);
		}
	}

	return null;
}

function validateRegistrationInput(
	body: RegisterBody,
	set: RegisterContext['set'],
	authSettings: ReturnType<typeof getAuthSettings>
) {
	const passwordError = validatePasswordStrength(body.password, {
		requireSpecialCharacter: authSettings.requireSpecialCharacter,
	});
	if (passwordError) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(passwordError, VALIDATION_ERROR_CODES.VALIDATION_WEAK_PASSWORD);
	}

	if (body.password !== body.confirmPassword) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('Passwords do not match');
	}

	return null;
}

async function handleRegister({ body, request, set }: RegisterContext) {
	const authSettings = getAuthSettings();

	const prereqError = checkRegistrationPrerequisites({ request, set }, authSettings);
	if (prereqError) return prereqError;

	const validationError = validateRegistrationInput(body, set, authSettings);
	if (validationError) return validationError;

	try {
		const created = await createUser({
			email: body.email,
			password: body.password,
			role: 'VIEWER',
			username: body.username,
		});

		try {
			const addedToWorkspace = addMemberToDefaultWorkspace(created.id, 'VIEWER');
			if (!addedToWorkspace) {
				logger.warn({ userId: created.id }, 'New user not added to default workspace');
			}

			const verificationResult = generateEmailVerificationToken(created.id);
			if (verificationResult) {
				void sendVerificationEmail(body.email, verificationResult.token).catch((err) => {
					logger.error({ err, userId: created.id }, 'Failed to send verification email');
				});
			}
		} catch (err) {
			// Compensate: hard-delete the partially initialized user
			logger.error(
				{ err, userId: created.id },
				'Post-registration setup failed, rolling back user creation'
			);
			hardDeleteUserForRollback(created.id);
			throw err;
		}

		trackEvent({
			eventCategory: 'conversion',
			eventName: 'user_self_registered',
			metadata: { role: 'VIEWER' },
			userId: created.id,
		});

		set.status = HTTP_STATUS.CREATED;
		return dataResponse({ message: 'Registration successful. Please check your email.' });
	} catch (err) {
		if (isUniqueConstraintError(err)) {
			logger.warn('Registration attempt with existing credentials');
			set.status = HTTP_STATUS.CREATED;
			return dataResponse({ message: 'Registration successful. Please check your email.' });
		}
		throw err;
	}
}

const authRegisterRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth' })
	.use(csrfPlugin)
	.post('/register', handleRegister, {
		body: t.Object({
			confirmPassword: t.String({
				maxLength: PASSWORD_MAX_LENGTH,
				minLength: PASSWORD_MIN_LENGTH,
			}),
			email: t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH }),
			password: t.String({
				maxLength: PASSWORD_MAX_LENGTH,
				minLength: PASSWORD_MIN_LENGTH,
			}),
			username: t.String({
				maxLength: USERNAME_MAX_LENGTH,
				minLength: USERNAME_MIN_LENGTH,
				pattern: USERNAME_PATTERN,
			}),
		}),
		detail: {
			description:
				'Registers a new user account with VIEWER role. Username must be 2-50 ' +
				'alphanumeric characters, password 8-128 characters with uppercase, lowercase, ' +
				'and a digit, and email must be valid. The new user is automatically added to ' +
				'the default workspace as VIEWER. A verification email is sent if SMTP is ' +
				'configured. Returns 400 ' +
				'for weak passwords or mismatched confirmation.',
			responses: {
				'201': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('Registration acknowledged', {
									message: 'Registration successful. Please check your email.',
								}),
							},
						},
					},
					description: 'User registered successfully.',
				},
				'400': {
					content: {
						'application/json': {
							examples: {
								weakPassword: {
									summary: 'Password does not meet requirements',
									value: {
										code: 'VALIDATION_WEAK_PASSWORD',
										error: 'Bad request',
										message:
											'Password must contain at least one uppercase letter',
									},
								},
							},
						},
					},
					description: 'Validation error.',
				},
				'429': RATE_LIMITED_EXAMPLE,
			},
			summary: 'Register a new user account',
		},
	})
	.get(
		'/registration-status',
		() => {
			const { requireSpecialCharacter, selfRegistrationEnabled } = getAuthSettings();
			return dataResponse({
				enabled: selfRegistrationEnabled,
				requireSpecialCharacter,
			});
		},
		{
			detail: {
				description:
					'Returns whether self-registration is currently enabled and the ' +
					'effective public password-policy flags (currently the special-character ' +
					'requirement) so client-side validation matches the server. ' +
					'This is a public endpoint — no authentication required.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: { success: SUCCESS_EXAMPLE },
							},
						},
						description: 'Registration status.',
					},
				},
				summary: 'Check if self-registration is enabled',
			},
		}
	);

export { authRegisterRoutes };
