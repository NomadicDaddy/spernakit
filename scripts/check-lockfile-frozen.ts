#!/usr/bin/env bun
/**
 * LTS lockfile freeze guard.
 *
 * Compares the SHA-256 of bun.lock against the committed baseline at
 * docs/lts-baseline/bun.lock.sha256. Unlike a `git status` check, this catches
 * committed lockfile changes too — any dependency bump since the baseline fails.
 *
 * Intentional dependency updates must regenerate the baseline in the same commit:
 *   bun -e "const c=await Bun.file('bun.lock').arrayBuffer();console.log(new Bun.CryptoHasher('sha256').update(c).digest('hex'))" > docs/lts-baseline/bun.lock.sha256
 *
 * Security advisories that require a lockfile change must be applied with the
 * LTS_LOCKFILE_BUMP=1 env override and accompanied by an ADR documenting the
 * CVE and fix scope.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const lockfilePath = join(repoRoot, 'bun.lock');
const baselinePath = join(repoRoot, 'docs', 'lts-baseline', 'bun.lock.sha256');

function main(): void {
	if (process.env.LTS_LOCKFILE_BUMP === '1') {
		console.warn(
			'⚠️  ⚠️  ⚠️  LTS_LOCKFILE_BUMP=1 — LOCKFILE FREEZE GUARD BYPASSED  ⚠️  ⚠️  ⚠️'
		);
		console.warn('The lockfile baseline is NOT being enforced for this run.');
		console.warn('This is only acceptable for a security advisory bump with an ADR');
		console.warn('documenting the CVE and fix scope. Regenerate the baseline and commit');
		console.warn('it together with bun.lock.');
		process.exit(0);
	}

	if (!existsSync(lockfilePath)) {
		console.error('bun.lock not found — run "bun install" to generate it.');
		process.exit(1);
	}

	if (!existsSync(baselinePath)) {
		console.error('docs/lts-baseline/bun.lock.sha256 not found — lockfile baseline missing.');
		console.error('Generate it from the current (reviewed) bun.lock and commit it.');
		process.exit(1);
	}

	const actual = createHash('sha256').update(readFileSync(lockfilePath)).digest('hex');
	const baseline = readFileSync(baselinePath, 'utf-8').trim().split(/\s+/)[0] ?? '';

	if (actual === baseline) {
		console.log('bun.lock matches the LTS baseline — lockfile freeze respected.');
		process.exit(0);
	}

	console.error('bun.lock does not match docs/lts-baseline/bun.lock.sha256.');
	console.error(`   baseline: ${baseline}`);
	console.error(`   actual:   ${actual}`);
	console.error('');
	console.error('LTS requires lockfile stability. If this dependency change is intentional,');
	console.error('regenerate the baseline IN THE SAME COMMIT as the bun.lock change:');
	console.error(
		"   bun -e \"const c=await Bun.file('bun.lock').arrayBuffer();console.log(new Bun.CryptoHasher('sha256').update(c).digest('hex'))\" > docs/lts-baseline/bun.lock.sha256"
	);
	console.error('If this is a security advisory bump, set LTS_LOCKFILE_BUMP=1 and add an ADR.');
	process.exit(1);
}

main();
