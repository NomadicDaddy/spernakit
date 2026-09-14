#!/usr/bin/env bun
/** Proves every password-establishment boundary retains the shared compromised-password policy. */
import { join } from 'node:path';

import { validatePasswordStrength } from '../backend/src/utils/auth/passwordValidation.ts';

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

const rejected = ['Password1!', 'Qwerty123!', 'Spernakit!2026'];
for (const password of rejected) {
	assert(
		validatePasswordStrength(password, { requireSpecialCharacter: true }) ===
			'Password is too common or easy to guess',
		`expected compromised or application-derived password to be rejected: ${password}`,
	);
}

assert(
	validatePasswordStrength('Violet-orbits-maple-73!', { requireSpecialCharacter: true }) === null,
	'a strong passphrase must remain acceptable',
);

const boundaryFiles = [
	'backend/src/routes/auth/register.ts',
	'backend/src/routes/auth/password-reset.ts',
	'backend/src/routes/users/profile.ts',
];
for (const relativePath of boundaryFiles) {
	const source = await Bun.file(join(import.meta.dir, '..', relativePath)).text();
	assert(
		source.includes('validatePasswordStrength('),
		`${relativePath} must call the shared password policy`,
	);
}

console.log(
	'[OK] common, compromised, and application-derived passwords are rejected at every boundary',
);
