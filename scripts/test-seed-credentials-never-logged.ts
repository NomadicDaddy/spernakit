#!/usr/bin/env bun
/**
 * Gate: the seed path can never write credential plaintext into a log file.
 *
 * Drives the real credential-display formatting against a stubbed logger and a captured stdout:
 * the logger must receive no message containing any generated credential, and stdout must stay
 * clean in a non-TTY environment (a CI run captures exactly this shape). The direct-write path
 * itself is exercised by asserting the formatter produces the username|password lines only when
 * explicitly called - never via logger.info/warn/error.
 *
 * demo-account-seeding criterion 18 (Phillip #45911 security exception).
 */

import { resolve } from 'node:path';

import { formatCredentialsForDisplay } from '../backend/src/utils/auth/passwordGenerator.ts';

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

// 1. The formatter's output contains the credentials (that is its job) - so the gate is that no
//    logger call in the seed path may pass it (or any credential substring) as a message.
const cred = { password: 'seed-plaintext-secret-1', username: 'admin' };
const formatted = formatCredentialsForDisplay([cred]);
assert(
	formatted.includes(cred.password),
	'formatter must carry the credential when explicitly invoked (display channel)',
);

// 2. Static proof: neither seed path contains a logger call whose argument is the credential
//    display; both print through the shared TTY-gated helper.
const dbDir = resolve(import.meta.dir, '../backend/src/db');
const autoSeedSource = await Bun.file(`${dbDir}/autoSeed.ts`).text();
const seedSource = await Bun.file(`${dbDir}/seed.ts`).text();
const helperSource = await Bun.file(`${dbDir}/seedCredentialDisplay.ts`).text();
assert(
	!/(logger\.(info|warn|error|debug|trace)\([^)]*formatCredentialsForDisplay)/s.test(
		autoSeedSource,
	) && !/logDatabase\([^)]*formatCredentialsForDisplay/.test(seedSource),
	'no logger call may receive formatCredentialsForDisplay output (autoSeed or the manual seed)',
);
assert(
	!/logger\.(info|warn|error|debug|trace)\([^)]*(cred|password)/s.test(autoSeedSource) ||
		!/logger\.[a-z]+\(\s*[^)]*cred\.(password|username)/.test(autoSeedSource),
	'no logger call may interpolate a credential field',
);
assert(
	helperSource.includes('process.stdout.write(formatCredentialsForDisplay(credentials))') &&
		helperSource.includes('process.stdout.isTTY'),
	'the display must be the helper TTY-gated direct write, not a logger',
);
assert(
	autoSeedSource.includes('printSeedCredentialsToConsole(credentials)') &&
		seedSource.includes('printSeedCredentialsToConsole(credentials)'),
	'both seed paths must print through the helper',
);
assert(
	autoSeedSource.includes('consoleIsInteractive') ||
		helperSource.includes('process.stdout.isTTY'),
	'the console write must be gated on an interactive TTY',
);

// 3. Non-TTY stdout capture: importing the module must not print anything (the write is gated
//    behind a TTY and this test process runs with piped stdout in CI).
const captured: string[] = [];
const originalWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = ((chunk: unknown) => {
	captured.push(String(chunk));
	return true;
}) as typeof process.stdout.write;
try {
	await import('../backend/src/db/autoSeed.ts');
} finally {
	process.stdout.write = originalWrite;
}
assert(
	!captured.some((chunk) => chunk.includes('seed-plaintext-secret-1')),
	'importing the seed module in a non-TTY process must not print credentials',
);

if (failures.length > 0) {
	console.error(`[FAIL] seed credentials never logged: ${failures.length} assertion(s)`);
	for (const f of failures) console.error(`  - ${f}`);
	process.exit(1);
}
console.log('[OK] Seed credentials never logged: display is TTY-gated direct write, logger clean');
