import { DEFAULT_REFRESH_TTL_MS } from '../../constants/auth.ts';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '../../constants/scheduler.ts';
import { Type } from '../configSchemaHelpers';

export const securitySchema = Type.Object({
	applicationApiKey: Type.String({ default: '' }),
	authCookieName: Type.String(),
	backupEncryptionKey: Type.String({ minLength: 64 }),
	backupEncryptionKeyPrevious: Type.Optional(Type.String()),
	bcryptRounds: Type.Integer({ default: 12, maximum: 31, minimum: 10 }),
	cookieMaxAge: Type.Integer(),
	cookieSecret: Type.String({ minLength: 32 }),
	cookieSecure: Type.Boolean({ default: true }),
	crossOriginEmbedderPolicy: Type.Boolean({ default: false }),
	csrfCookieName: Type.String(),
	csrfTokenTtlMs: Type.Integer({ default: 4 * MS_PER_HOUR, minimum: MS_PER_MINUTE }),
	emailChangeTokenExpiryMs: Type.Integer({
		default: MS_PER_HOUR,
		maximum: MS_PER_DAY,
		minimum: 5 * MS_PER_MINUTE,
	}),
	emailVerificationTokenExpiryMs: Type.Integer({
		default: MS_PER_DAY,
		maximum: DEFAULT_REFRESH_TTL_MS,
		minimum: MS_PER_HOUR,
	}),
	encryptionKey: Type.String({ minLength: 64 }),
	jwtExpiresIn: Type.String({ default: '15m' }),
	jwtPrivateKey: Type.String({ minLength: 16 }),
	jwtPrivateKeyPrevious: Type.Optional(Type.String()),
	jwtPublicKey: Type.String({ minLength: 16 }),
	jwtPublicKeyPrevious: Type.Optional(Type.String()),
	jwtRefreshExpiresIn: Type.String({ default: '7d' }),
	jwtRefreshPrivateKey: Type.String({ minLength: 16 }),
	jwtRefreshPrivateKeyPrevious: Type.Optional(Type.String()),
	jwtRefreshPublicKey: Type.String({ minLength: 16 }),
	jwtRefreshPublicKeyPrevious: Type.Optional(Type.String()),
	maxTokenSize: Type.Integer(),
	mfaChallengeExpiresIn: Type.String({ default: '5m' }),
	mfaPrivateKey: Type.String({
		default: '',
		description:
			'Dedicated ES256 private key for short-lived MFA challenge tokens. ' +
			'Generate with `bun run generate-keys`; required in production.',
	}),
	mfaPublicKey: Type.String({
		default: '',
		description:
			'Dedicated ES256 public key for verifying MFA challenge tokens. ' +
			'Must match security.mfaPrivateKey; required in production.',
	}),
	oauthStateSecret: Type.Optional(Type.String({ minLength: 32 })),
	passwordResetTokenExpiryMs: Type.Integer({
		maximum: MS_PER_DAY,
		minimum: 5 * MS_PER_MINUTE,
	}),
	refreshCookieName: Type.String(),
	strictCsp: Type.Boolean({ default: true }),
});
