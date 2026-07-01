import { Elysia, t } from 'elysia';

import type { AuthPayload } from '../../plugins/auth.ts';
import type { DataResponse } from '../../utils/apiResponse.ts';
import type { ErrorResponse } from '../../utils/errorResponse.ts';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	badRequestExample,
	dataExample,
	FORBIDDEN_EXAMPLE,
	INTERNAL_ERROR_EXAMPLE,
	SUCCESS_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { EMAIL_MAX_LENGTH } from '../../constants/validation.ts';
import { assertUser, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { escapeHtml, sendEmail } from '../../services/emailService.ts';
import {
	getEmailStatus,
	getSmtpConfigMasked,
	isSmtpConfigured,
	recordTestResult,
	updateSmtpConfig,
} from '../../services/smtpService.ts';
import { dataResponse, successResponse } from '../../utils/apiResponse.ts';
import { setCacheHeaders } from '../../utils/caching.ts';
import { badRequestError, internalError } from '../../utils/errorResponse.ts';

/* ------------------------------------------------------------------ */
/*  Extracted handlers                                                 */
/* ------------------------------------------------------------------ */

async function handleSmtpTest({
	body,
	set,
	user,
}: {
	body: { message?: string; subject?: string; testEmail: string };
	set: { status?: number | string };
	user: AuthPayload | null;
}): Promise<DataResponse<null> | ErrorResponse> {
	if (!isSmtpConfigured()) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError('SMTP is not configured');
	}

	const appName = getConfig().app.name;
	const safeMessage = body.message ? escapeHtml(body.message) : null;
	const html = safeMessage
		? `<p>${safeMessage}</p>`
		: `<p>This is a test email from ${escapeHtml(appName)}.</p>`;

	const text = body.message ? body.message : `This is a test email from ${appName}.`;
	const subject = (body.subject || `${appName} - Test Email`).replace(/[\r\n]/g, ' ');

	const sent = await sendEmail({
		html,
		subject,
		text,
		to: body.testEmail,
	});

	if (user) {
		recordTestResult(sent.success, user.id);
	}

	if (!sent.success) {
		set.status = HTTP_STATUS.INTERNAL_SERVER_ERROR;
		return internalError();
	}

	return successResponse();
}

const settingsSmtpRoutes = new Elysia({
	detail: { tags: ['Settings'] },
	prefix: '/settings',
})
	.use(authPlugin)
	.get(
		'/smtp/config',
		async ({ set }) => {
			// SMTP config rarely changes - use long cache (1 hr)
			setCacheHeaders(set, 'LONG');
			return dataResponse(await getSmtpConfigMasked());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			detail: {
				description:
					'Retrieves SMTP configuration including host, port, secure flag, ' +
					'credentials, and from address/name. Cached for 1 hour. Requires SYSOP ' +
					'role only.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('SMTP configuration', {
										fromAddress: 'noreply@example.com',
										fromName: 'My App',
										host: 'smtp.example.com',
										password: '***',
										port: 587,
										secure: false,
										user: 'user@example.com',
									}),
								},
							},
						},
						description: 'SMTP configuration.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get SMTP configuration (SYSOP only)',
			},
		}
	)
	.put(
		'/smtp/config',
		async ({ body, user }) => {
			const authUser = assertUser(user);
			const config = await updateSmtpConfig(body, authUser.id);
			logAudit({
				action: 'SETTINGS_UPDATE',
				details: {
					fields: Object.keys(body),
					section: 'smtp',
				},
				entityId: 'smtp',
				entityType: 'settings',
				userId: authUser.id,
			});
			return dataResponse(config);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Object({
				fromAddress: t.Optional(t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH })),
				fromName: t.Optional(t.String({ maxLength: 100 })),
				host: t.Optional(t.String({ maxLength: 255 })),
				password: t.Optional(t.String({ maxLength: 255 })),
				port: t.Optional(t.Integer({ maximum: 65535, minimum: 1 })),
				secure: t.Optional(t.Boolean()),
				user: t.Optional(t.String({ maxLength: 255 })),
			}),
			detail: {
				description:
					'Updates SMTP configuration. Only SYSOP role can modify these settings. ' +
					'All fields are optional - partial updates supported. Changes are logged in ' +
					'audit trail.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Updated SMTP configuration', {
										fromAddress: 'noreply@example.com',
										fromName: 'My App',
										host: 'smtp.gmail.com',
										password: '***',
										port: 587,
										secure: true,
										user: 'myapp@gmail.com',
									}),
								},
							},
						},
						description: 'Updated SMTP configuration.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Update SMTP configuration (SYSOP only)',
			},
		}
	)
	.post('/smtp/test', handleSmtpTest, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		body: t.Object({
			message: t.Optional(t.String({ maxLength: 2000 })),
			subject: t.Optional(t.String({ maxLength: 255 })),
			testEmail: t.String({ format: 'email', maxLength: EMAIL_MAX_LENGTH }),
		}),
		detail: {
			description:
				'Sends a test email to specified address to verify SMTP configuration. ' +
				'Accepts optional subject and message body. Returns 400 if SMTP is not ' +
				'configured, 500 if sending fails. Test result is recorded. Requires SYSOP ' +
				'role only.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: { success: SUCCESS_EXAMPLE },
						},
					},
					description: 'Test email sent successfully.',
				},
				'400': badRequestExample('SMTP is not configured'),
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
				'500': INTERNAL_ERROR_EXAMPLE,
			},
			summary: 'Send SMTP test email (SYSOP only)',
		},
	})
	.get(
		'/email/status',
		async ({ set }) => {
			// SMTP config rarely changes - use long cache (1 hr)
			setCacheHeaders(set, 'LONG');
			return dataResponse(await getEmailStatus());
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Returns email configuration status including whether SMTP is configured, ' +
					'can send emails, and last test result. Cached for 1 hour. Requires ADMIN ' +
					'role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									configured: dataExample('Email is configured', {
										canSend: true,
										configured: true,
										lastTestAt: '2026-02-05T12:00:00Z',
										lastTestSuccess: true,
									}),
									notConfigured: dataExample('Email is not configured', {
										canSend: false,
										configured: false,
										lastTestAt: null,
										lastTestSuccess: false,
									}),
								},
							},
						},
						description: 'Email status.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get email status (ADMIN+)',
			},
		}
	);

export { settingsSmtpRoutes };
