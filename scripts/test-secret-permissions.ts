#!/usr/bin/env bun
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

import { secureSecretPath } from '../backend/src/config/secretPermissions.ts';

const temp = mkdtempSync(join(tmpdir(), 'spernakit-secret-acl-'));
const secretPath = join(temp, 'fixture.secrets.json');
writeFileSync(secretPath, '{"token":"fixture-only"}', 'utf8');

if (process.platform === 'win32') {
	const broad = spawnSync('icacls', [secretPath, '/grant', '*S-1-1-0:(R)'], {
		encoding: 'utf8',
		windowsHide: true,
	});
	if (broad.status !== 0) throw new Error(`Could not create broad ACL fixture at ${secretPath}`);
} else {
	chmodSync(temp, 0o755);
	chmodSync(secretPath, 0o644);
}

secureSecretPath(temp, 'directory');
secureSecretPath(secretPath, 'file');
if (readFileSync(secretPath, 'utf8') !== '{"token":"fixture-only"}') {
	throw new Error('Permission repair changed secret-file contents');
}

if (process.platform === 'win32') {
	const acl = spawnSync('icacls', [secretPath], { encoding: 'utf8', windowsHide: true }).stdout;
	const entries = acl
		.split(/\r?\n/)
		.map((line, index) => (index === 0 ? line.replace(secretPath, '') : line).trim())
		.map((line) => line.match(/^(.+?):\(/)?.[1])
		.filter((identity): identity is string => identity !== undefined);
	const username = userInfo().username.toLowerCase();
	if (entries.some((identity) => !identity.toLowerCase().endsWith(`\\${username}`))) {
		throw new Error(`Secret fixture still has non-owner ACL entries at ${secretPath}`);
	}
} else if ((statSync(secretPath).mode & 0o777) !== 0o600) {
	throw new Error(`Secret fixture mode is not owner-only at ${secretPath}`);
}

try {
	rmSync(temp, { force: true, recursive: true });
} catch {
	// A Windows scanner can briefly retain a handle; the fixture contains no operator secret.
}
console.log('[OK] synthetic config and split-secret paths are repaired to owner-only access');
