import { Elysia, t } from 'elysia';

import { PASSWORD_MAX_LENGTH } from '../../constants/validation.ts';
import { authPlugin } from '../../plugins/auth.ts';
import { csrfPlugin } from '../../plugins/csrf.ts';
import {
	handleDisableMfa,
	handleMfaSetup,
	handleMfaStatus,
	handleRegenerateRecoveryCodes,
	handleVerifyMfa,
	handleVerifyMfaSetup,
	handleVerifyRecovery,
} from './mfa-handlers.ts';
import {
	mfaDisableDocs,
	mfaRegenerateRecoveryCodesDocs,
	mfaSetupDocs,
	mfaStatusDocs,
	mfaVerifyDocs,
	mfaVerifyRecoveryDocs,
	mfaVerifySetupDocs,
} from './mfa.docs.ts';

/**
 * MFA (Multi-Factor Authentication) routes.
 *
 * Provides TOTP-based MFA setup, verification, disable, and recovery code management.
 * All endpoints require authentication except /verify and /verify-recovery which
 * use MFA challenge tokens.
 */
const authMfaRoutes = new Elysia({ detail: { tags: ['Auth'] }, prefix: '/auth/mfa' })
	.use(authPlugin)
	.use(csrfPlugin)
	.get('/status', handleMfaStatus, {
		detail: mfaStatusDocs,
		requireAuth: true,
	})
	.post('/setup', handleMfaSetup, {
		body: t.Object({
			currentPassword: t.String({ maxLength: PASSWORD_MAX_LENGTH, minLength: 1 }),
		}),
		detail: mfaSetupDocs,
		requireAuth: true,
	})
	.post('/verify-setup', handleVerifyMfaSetup, {
		body: t.Object({
			code: t.String({ maxLength: 6, minLength: 6, pattern: '^[0-9]{6}$' }),
		}),
		detail: mfaVerifySetupDocs,
		requireAuth: true,
	})
	.post('/verify', handleVerifyMfa, {
		body: t.Object({
			code: t.String({ maxLength: 6, minLength: 6, pattern: '^[0-9]{6}$' }),
			mfaToken: t.String({ maxLength: 1000, minLength: 1 }),
		}),
		detail: mfaVerifyDocs,
	})
	.post('/verify-recovery', handleVerifyRecovery, {
		body: t.Object({
			mfaToken: t.String({ maxLength: 1000, minLength: 1 }),
			recoveryCode: t.String({ maxLength: 20, minLength: 1 }),
		}),
		detail: mfaVerifyRecoveryDocs,
	})
	.post('/disable', handleDisableMfa, {
		body: t.Object({
			code: t.String({ maxLength: 6, minLength: 6, pattern: '^[0-9]{6}$' }),
		}),
		detail: mfaDisableDocs,
		requireAuth: true,
	})
	.post('/recovery-codes', handleRegenerateRecoveryCodes, {
		body: t.Object({
			code: t.String({ maxLength: 6, minLength: 6, pattern: '^[0-9]{6}$' }),
		}),
		detail: mfaRegenerateRecoveryCodesDocs,
		requireAuth: true,
	});

export { authMfaRoutes };
