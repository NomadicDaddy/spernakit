import { Elysia, t } from 'elysia';

import { PASSWORD_MAX_LENGTH } from '../../constants/validation.ts';
import { requireAuth } from '../../guards/role.ts';
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
		beforeHandle: requireAuth,
		detail: mfaStatusDocs,
	})
	.post('/setup', handleMfaSetup, {
		beforeHandle: requireAuth,
		body: t.Object({
			currentPassword: t.String({ maxLength: PASSWORD_MAX_LENGTH, minLength: 1 }),
		}),
		detail: mfaSetupDocs,
	})
	.post('/verify-setup', handleVerifyMfaSetup, {
		beforeHandle: requireAuth,
		body: t.Object({
			code: t.String({ maxLength: 6, minLength: 6, pattern: '^[0-9]{6}$' }),
		}),
		detail: mfaVerifySetupDocs,
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
		beforeHandle: requireAuth,
		body: t.Object({
			code: t.String({ maxLength: 6, minLength: 6, pattern: '^[0-9]{6}$' }),
		}),
		detail: mfaDisableDocs,
	})
	.post('/recovery-codes', handleRegenerateRecoveryCodes, {
		beforeHandle: requireAuth,
		body: t.Object({
			code: t.String({ maxLength: 6, minLength: 6, pattern: '^[0-9]{6}$' }),
		}),
		detail: mfaRegenerateRecoveryCodesDocs,
	});

export { authMfaRoutes };
