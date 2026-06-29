import { Elysia, t } from 'elysia';

import type { AuthPayload } from '../../plugins/auth.ts';

import { getConfig } from '../../config/configLoader.ts';
import { HTTP_STATUS } from '../../constants/httpStatus.ts';
import {
	dataExample,
	FORBIDDEN_EXAMPLE,
	UNAUTHORIZED_EXAMPLE,
} from '../../constants/responseExamples.ts';
import { assertUser, requireRoleFresh } from '../../guards/role.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { log as logAudit } from '../../services/auditService.ts';
import { getAuthSettings, updateAuthSettings } from '../../services/authService.ts';
import { reEncryptAllBackups } from '../../services/backupService.ts';
import { dataResponse } from '../../utils/apiResponse.ts';
import { badRequestError, VALIDATION_ERROR_CODES } from '../../utils/errorResponse.ts';

async function handleRotateBackupKey({
	set,
	user,
}: {
	set: { headers: Record<string, number | string>; status?: number | string };
	user: AuthPayload | null;
}) {
	const authUser = assertUser(user);
	const config = getConfig();

	if (!config.security.backupEncryptionKeyPrevious) {
		set.status = HTTP_STATUS.BAD_REQUEST;
		return badRequestError(
			'Cannot re-encrypt backups: backupEncryptionKeyPrevious is not set. ' +
				'Stage a rotation by setting the old key as backupEncryptionKeyPrevious ' +
				'and the new key as backupEncryptionKey in config, then restart the app ' +
				'before calling this endpoint. See docs/template/DEVELOPMENT.md ' +
				'(Operations — Key Rotation) for the full procedure.',
			VALIDATION_ERROR_CODES.VALIDATION_FAILED
		);
	}

	const result = await reEncryptAllBackups();

	logAudit({
		action: 'BACKUP_KEY_ROTATE',
		details: { failed: result.failed, processed: result.processed },
		entityId: 'backup-encryption-key',
		entityType: 'security',
		userId: authUser.id,
	});

	return dataResponse(result);
}

const settingsAuthSecurityRoutes = new Elysia({
	detail: { tags: ['Settings'] },
	prefix: '/settings',
})
	.use(authPlugin)
	.get(
		'/auth-security',
		() => {
			const settings = getAuthSettings();
			return dataResponse(settings);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('ADMIN')({ set, user }),
			detail: {
				description:
					'Retrieves authentication security settings including password policy, ' +
					'account lockout, and password expiry rules. Returns defaults if not configured. ' +
					'Cached for 5 minutes. Requires ADMIN role or higher.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Auth security settings', {
										enableAccountLocking: true,
										lockoutDurationMinutes: 15,
										maxLoginAttempts: 5,
										minPasswordAgeDays: 1,
										passwordExpiryDays: 90,
										requirePasswordChange: true,
									}),
								},
							},
						},
						description: 'Auth security settings.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Get auth security settings (ADMIN+)',
			},
		}
	)
	.put(
		'/auth-security',
		({ body, user }) => {
			const authUser = assertUser(user);
			const settings = updateAuthSettings(body, authUser.id);
			logAudit({
				action: 'SETTINGS_UPDATE',
				details: { changes: body, section: 'auth-security' },
				entityId: 'auth-security',
				entityType: 'settings',
				userId: authUser.id,
			});
			return dataResponse(settings);
		},
		{
			beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
			body: t.Object({
				authRateLimitEnabled: t.Optional(t.Boolean()),
				authRateLimitMaxRequests: t.Optional(t.Integer({ minimum: 1 })),
				authRateLimitWindowMinutes: t.Optional(t.Integer({ minimum: 1 })),
				enableAccountLocking: t.Optional(t.Boolean()),
				lockoutDurationMinutes: t.Optional(t.Integer({ minimum: 1 })),
				maxLoginAttempts: t.Optional(t.Integer({ minimum: 1 })),
				minPasswordAgeDays: t.Optional(t.Integer({ minimum: 0 })),
				passwordExpiryDays: t.Optional(t.Integer({ minimum: 0 })),
				passwordHistoryDepth: t.Optional(t.Integer({ minimum: 0 })),
				requirePasswordChange: t.Optional(t.Boolean()),
				requireSpecialCharacter: t.Optional(t.Boolean()),
				selfRegistrationEnabled: t.Optional(t.Boolean()),
			}),
			detail: {
				description:
					'Updates authentication security settings. Only SYSOP role can modify ' +
					'these settings. Settings control password policy, account lockout behavior, ' +
					'and password expiry rules. All fields are optional - partial updates supported. ' +
					'Changes are logged in audit trail.',
				responses: {
					'200': {
						content: {
							'application/json': {
								examples: {
									success: dataExample('Updated auth security settings', {
										enableAccountLocking: true,
										lockoutDurationMinutes: 30,
										maxLoginAttempts: 3,
										minPasswordAgeDays: 0,
										passwordExpiryDays: 60,
										requirePasswordChange: false,
									}),
								},
							},
						},
						description: 'Updated auth security settings.',
					},
					'401': UNAUTHORIZED_EXAMPLE,
					'403': FORBIDDEN_EXAMPLE,
				},
				summary: 'Update auth security settings (SYSOP only)',
			},
		}
	)
	.post('/auth-security/rotate-backup-key', handleRotateBackupKey, {
		beforeHandle: ({ set, user }) => requireRoleFresh('SYSOP')({ set, user }),
		detail: {
			description:
				'Re-encrypts every existing backup file under the current `backupEncryptionKey`. ' +
				'Requires `backupEncryptionKeyPrevious` to be set in config (i.e., a rotation is ' +
				'staged). Does NOT modify configuration — the operator must update the config ' +
				'(set new key as `backupEncryptionKey`, old key as `backupEncryptionKeyPrevious`) ' +
				'and restart BEFORE calling this endpoint. Only SYSOP role can invoke. All actions ' +
				'are logged in the audit trail.',
			responses: {
				'200': {
					content: {
						'application/json': {
							examples: {
								success: dataExample('Re-encrypt result', {
									failed: 0,
									processed: 7,
								}),
							},
						},
					},
					description:
						'Re-encryption completed. `processed` counts files re-encrypted under the current key; `failed` counts files that could not be decrypted under either key.',
				},
				'400': {
					content: {
						'application/json': {
							examples: {
								notStaged: {
									summary: 'Rotation not staged',
									value: {
										code: 'VALIDATION_FAILED',
										error: 'Bad request',
										message:
											'Cannot re-encrypt backups: backupEncryptionKeyPrevious is not set.',
									},
								},
							},
						},
					},
					description:
						'Rotation has not been staged — the previous key is missing from config.',
				},
				'401': UNAUTHORIZED_EXAMPLE,
				'403': FORBIDDEN_EXAMPLE,
			},
			summary: 'Re-encrypt backups under rotated key (SYSOP only)',
		},
	});

export { settingsAuthSecurityRoutes };
