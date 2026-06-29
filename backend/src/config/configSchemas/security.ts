import { z } from 'zod';

import { DEFAULT_REFRESH_TTL_MS } from '../../constants/auth.ts';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '../../constants/scheduler.ts';

export const securitySchema = z.object({
	applicationApiKey: z.string().default(''),
	authCookieName: z.string(),
	backupEncryptionKey: z.string().min(64),
	backupEncryptionKeyPrevious: z.string().optional(),
	bcryptRounds: z.number().int().min(10).max(31).default(12),
	cookieMaxAge: z.number().int(),
	cookieSecret: z.string().min(32),
	cookieSecure: z.boolean().default(true),
	crossOriginEmbedderPolicy: z.boolean().default(false),
	csrfCookieName: z.string(),
	csrfTokenTtlMs: z
		.number()
		.int()
		.min(MS_PER_MINUTE)
		.default(4 * MS_PER_HOUR),
	emailChangeTokenExpiryMs: z
		.number()
		.int()
		.min(5 * MS_PER_MINUTE)
		.max(MS_PER_DAY)
		.default(MS_PER_HOUR),
	emailVerificationTokenExpiryMs: z
		.number()
		.int()
		.min(MS_PER_HOUR)
		.max(DEFAULT_REFRESH_TTL_MS)
		.default(MS_PER_DAY),
	encryptionKey: z.string().min(64),
	jwtExpiresIn: z.string().default('15m'),
	jwtPrivateKey: z.string().min(16),
	jwtPrivateKeyPrevious: z.string().optional(),
	jwtPublicKey: z.string().min(16),
	jwtPublicKeyPrevious: z.string().optional(),
	jwtRefreshExpiresIn: z.string().default('7d'),
	jwtRefreshPrivateKey: z.string().min(16),
	jwtRefreshPrivateKeyPrevious: z.string().optional(),
	jwtRefreshPublicKey: z.string().min(16),
	jwtRefreshPublicKeyPrevious: z.string().optional(),
	maxTokenSize: z.number().int(),
	mfaChallengeExpiresIn: z.string().default('5m'),
	mfaPrivateKey: z
		.string()
		.default('')
		.describe(
			'Dedicated ES256 private key for short-lived MFA challenge tokens. ' +
				'Generate with `bun run generate-keys`; required in production.'
		),
	mfaPublicKey: z
		.string()
		.default('')
		.describe(
			'Dedicated ES256 public key for verifying MFA challenge tokens. ' +
				'Must match security.mfaPrivateKey; required in production.'
		),
	oauthStateSecret: z.string().min(32).optional(),
	passwordResetTokenExpiryMs: z
		.number()
		.int()
		.min(5 * MS_PER_MINUTE)
		.max(MS_PER_DAY),
	refreshCookieName: z.string(),
	strictCsp: z.boolean().default(true),
});
