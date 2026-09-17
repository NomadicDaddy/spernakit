#!/usr/bin/env bun
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const temp = mkdtempSync(join(tmpdir(), 'spernakit-prettier-cache-'));
const fixture = join(temp, 'probe.ts');
const cache = join(temp, 'prettier.cache');

function prettier(mode: '--check' | '--write'): number {
	return Bun.spawnSync(
		[
			'bunx',
			'prettier',
			mode,
			fixture,
			'--config',
			resolve('.prettierrc'),
			'--cache',
			'--cache-location',
			cache,
		],
		{ stderr: 'pipe', stdout: 'pipe', windowsHide: true },
	).exitCode;
}

writeFileSync(fixture, 'export const value={a:1,b:2}\n');
if (prettier('--check') === 0) throw new Error('Misformatted first revision was cached as valid');
if (prettier('--write') !== 0) throw new Error('Fixture formatting failed');
if (prettier('--check') !== 0 || prettier('--check') !== 0) {
	throw new Error('Unchanged formatted revision did not pass through the persistent cache');
}
writeFileSync(fixture, 'export const value={a:1,b:3}\n');
if (prettier('--check') === 0) throw new Error('Changed misformatted revision reused a stale pass');
try {
	rmSync(temp, { force: true, recursive: true });
} catch {
	// Best-effort cleanup of a synthetic formatter fixture.
}
console.log('[OK] Prettier cache reuses unchanged files and rechecks changed content');
