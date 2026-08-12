/**
 * The catalog of security keys `scripts/generate-keys.ts` can regenerate, and
 * the parser for its `--only` selection.
 *
 * Each group names the config fields it rewrites and what breaks when it is
 * rotated while already in use, so the script can warn about the specific
 * damage a run would do rather than the worst case across all ten fields.
 */
import { generateEcKeyPair, generateHexKey, generateSecureKey } from './crypto-keys.ts';

export type SecurityField =
	| 'applicationApiKey'
	| 'backupEncryptionKey'
	| 'cookieSecret'
	| 'encryptionKey'
	| 'jwtPrivateKey'
	| 'jwtPublicKey'
	| 'jwtRefreshPrivateKey'
	| 'jwtRefreshPublicKey'
	| 'mfaPrivateKey'
	| 'mfaPublicKey';

export type SecuritySection = Partial<Record<SecurityField, string>>;

export interface KeyGroup {
	/** What breaks when this group is rotated while already in use. */
	consequence: string;
	/** Config keys under `security` that this group rewrites. */
	fields: readonly SecurityField[];
	generate: () => SecuritySection;
	label: string;
}

export const KEY_GROUPS = {
	'app-api-key': {
		consequence: 'integrations authenticating with the current API key stop working',
		fields: ['applicationApiKey'],
		generate: () => ({ applicationApiKey: generateSecureKey(48) }),
		label: 'APPLICATION_API_KEY (48 characters)',
	},
	'backup-encryption-key': {
		consequence: 'every existing encrypted backup becomes permanently unreadable',
		fields: ['backupEncryptionKey'],
		generate: () => ({ backupEncryptionKey: generateHexKey(32) }),
		label: 'BACKUP_ENCRYPTION_KEY (64 hex characters)',
	},
	'cookie-secret': {
		consequence:
			'OAuth logins already in flight fail because their state and PKCE binding no longer verifies',
		fields: ['cookieSecret'],
		generate: () => ({ cookieSecret: generateSecureKey(32) }),
		label: 'COOKIE_SECRET (32 characters)',
	},
	'encryption-key': {
		consequence: 'field-level encrypted data becomes permanently unreadable',
		fields: ['encryptionKey'],
		generate: () => ({ encryptionKey: generateHexKey(32) }),
		label: 'ENCRYPTION_KEY (64 hex characters)',
	},
	jwt: {
		consequence: 'every access token is rejected and all users are signed out',
		fields: ['jwtPrivateKey', 'jwtPublicKey'],
		generate: () => {
			const pair = generateEcKeyPair();
			return { jwtPrivateKey: pair.privateKey, jwtPublicKey: pair.publicKey };
		},
		label: 'JWT_KEY_PAIR (EC P-256, ES256)',
	},
	'jwt-refresh': {
		consequence: 'every refresh token is rejected and all sessions end at the next refresh',
		fields: ['jwtRefreshPrivateKey', 'jwtRefreshPublicKey'],
		generate: () => {
			const pair = generateEcKeyPair();
			return { jwtRefreshPrivateKey: pair.privateKey, jwtRefreshPublicKey: pair.publicKey };
		},
		label: 'JWT_REFRESH_KEY_PAIR (EC P-256, ES256)',
	},
	mfa: {
		// The pair signs short-lived challenge tokens only; enrolled authenticators
		// are unaffected because TOTP secrets are not encrypted with it.
		consequence: 'MFA challenges already in flight fail and those users log in again',
		fields: ['mfaPrivateKey', 'mfaPublicKey'],
		generate: () => {
			const pair = generateEcKeyPair();
			return { mfaPrivateKey: pair.privateKey, mfaPublicKey: pair.publicKey };
		},
		label: 'MFA_KEY_PAIR (EC P-256, ES256)',
	},
} as const satisfies Record<string, KeyGroup>;

export type GroupName = keyof typeof KEY_GROUPS;

export const GROUP_NAMES = Object.keys(KEY_GROUPS) as GroupName[];

/**
 * Resolve which key groups a run rewrites. Without `--only` that is all of
 * them, matching the historical behavior of the script.
 *
 * Throws on unrecognized input so the caller can exit before backing up or
 * writing anything.
 */
export function parseSelection(argv: string[]): GroupName[] {
	const requested: string[] = [];

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i] ?? '';
		if (arg === '--only') {
			const value = argv[++i];
			if (!value) throw new Error('--only requires a value, for example: --only mfa');
			requested.push(...value.split(','));
			continue;
		}
		if (arg.startsWith('--only=')) {
			requested.push(...arg.slice('--only='.length).split(','));
			continue;
		}
		throw new Error(
			`Unrecognized argument: ${arg}\n\nUsage: bun run generate-keys [-- --only ${GROUP_NAMES.join('|')}]`,
		);
	}

	if (requested.length === 0) return GROUP_NAMES;

	const selected: GroupName[] = [];
	for (const raw of requested) {
		const name = raw.trim();
		if (!name) continue;
		if (!GROUP_NAMES.includes(name as GroupName)) {
			throw new Error(
				`Unknown key group: ${name}\n\nValid groups: ${GROUP_NAMES.join(', ')}`,
			);
		}
		if (!selected.includes(name as GroupName)) selected.push(name as GroupName);
	}

	if (selected.length === 0) throw new Error('--only requires at least one key group');
	return selected;
}
