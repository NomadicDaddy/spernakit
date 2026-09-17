#!/usr/bin/env bun
/**
 * Regression coverage for MFA challenge-token transport.
 *
 * Login hands the token to this page through router state. OAuth cannot do that across its
 * backend redirect, so it puts the token in the URL fragment. The page must replace that fragment
 * with clean router state before showing the form. Query strings are deliberately excluded: they
 * are sent to servers and proxies, where a short-lived authentication credential can enter logs.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

import { readMfaTokenTransport } from '../frontend/src/lib/mfaTokenTransport.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pagePath = join(repoRoot, 'frontend/src/pages/auth/MfaVerifyPage.tsx');
const pageSource = readFileSync(pagePath, 'utf8');
const failures: string[] = [];

function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

const queryOnly = readMfaTokenTransport({
	hash: '',
	search: '?mfaToken=query-secret',
	state: null,
});
assert(
	queryOnly.fragmentToken === '' && queryOnly.stateToken === '',
	'a query-string token must be ignored',
);

const stateOnly = readMfaTokenTransport({
	hash: '',
	search: '',
	state: { mfaToken: 'state-secret' },
});
assert(stateOnly.stateToken === 'state-secret', 'a router-state token must remain available');
assert(stateOnly.fragmentToken === '', 'router state must not manufacture a fragment token');

const malformedState = readMfaTokenTransport({
	hash: '',
	search: '',
	state: { mfaToken: 123 },
});
assert(malformedState.stateToken === '', 'a non-string router-state token must be ignored');

const fragmentOnly = readMfaTokenTransport({
	hash: '#mfaToken=fragment%2Esecret',
	search: '',
	state: null,
});
assert(
	fragmentOnly.fragmentToken === 'fragment.secret',
	'a URL-encoded fragment token must remain available',
);
assert(fragmentOnly.stateToken === '', 'a fragment must not manufacture a router-state token');

assert(
	pageSource.includes("import { readMfaTokenTransport } from '@/lib/mfaTokenTransport';") &&
		pageSource.includes('readMfaTokenTransport(location)'),
	'the MFA page must consume the transport reader used by this regression',
);
assert(
	pageSource.includes(
		'<Navigate replace state={{ mfaToken: fragmentToken }} to="/mfa-verify" />',
	),
	'the page must replace a consumed fragment with clean router state before rendering the form',
);
assert(
	!pageSource.includes("location.search).get('mfaToken')"),
	'the page must not restore query-string token parsing',
);
assert(
	pageSource.includes('verifyMfaRecovery(mfaToken') &&
		pageSource.includes('verifyMfaChallenge(mfaToken'),
	'TOTP and recovery-code verification must keep using the selected challenge token',
);
assert(
	pageSource.includes("err.code === 'AUTH_MFA_TOKEN_INVALID'") &&
		pageSource.includes("navigate('/login', { replace: true })"),
	'invalid or expired challenges must still return the user to login',
);

if (failures.length > 0) {
	console.error(`[FAIL] MFA token transport regression (${String(failures.length)} failure(s))`);
	for (const failure of failures) console.error(`- ${failure}`);
	exit(1);
}

console.log('[OK] MFA challenge tokens use router state or a one-time fragment, never the query');
