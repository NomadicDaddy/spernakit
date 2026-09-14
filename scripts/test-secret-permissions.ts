#!/usr/bin/env bun
/**
 * Regression coverage for the secret permission guard (`backend/src/config/secretPermissions.ts`).
 *
 * Part one drives the POSIX policy through injected primitives so every host proves the mount
 * contract: a refused or ineffective chmod is accepted only under `/app/config` and only when that
 * path is a real mount point, while every other path fails closed with a path-only diagnostic.
 * Part two repairs a synthetic broad fixture on this OS.
 */
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';

import {
	parseMountPoints,
	type PosixSecretIo,
	securePosixSecretPath,
	secureSecretPath,
	TRUSTED_CONFIG_MOUNT,
} from '../backend/src/config/secretPermissions.ts';

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function throws(fn: () => unknown, expected: string, message: string): void {
	try {
		fn();
	} catch (err) {
		const text = err instanceof Error ? err.message : String(err);
		assert(text === expected, `${message}: error "${text}" is not "${expected}"`);
		return;
	}
	throw new Error(`${message}: expected a throw`);
}

/** Lines captured from a Windows Docker Desktop container whose config is a drvfs bind mount. */
const DOCKER_DESKTOP_MOUNTINFO = [
	'457 445 0:70 / / rw,relatime master:1 - overlay overlay rw,lowerdir=/x',
	'466 457 0:71 /host/smoke/config /app/config rw,noatime - 9p C:\\134 rw',
	'470 457 0:72 / /app/with\\040space rw - tmpfs tmpfs rw',
].join('\n');

interface FakeIoOptions {
	chmodError?: string;
	modeAfterChmod: number;
	mounted: boolean;
}

interface FakeIo extends PosixSecretIo {
	chmodCalls: number[];
	mountReads: number;
}

function fakeIo(options: FakeIoOptions): FakeIo {
	const io: FakeIo = {
		chmod: (_filePath, mode) => {
			io.chmodCalls.push(mode);
			if (options.chmodError) {
				throw Object.assign(new Error('fs refused'), { code: options.chmodError });
			}
		},
		chmodCalls: [],
		mode: () => options.modeAfterChmod,
		mountPoints: () => {
			io.mountReads++;
			return options.mounted ? new Set([TRUSTED_CONFIG_MOUNT]) : new Set();
		},
		mountReads: 0,
	};
	return io;
}

function testMountTableParsing(): void {
	const points = parseMountPoints(DOCKER_DESKTOP_MOUNTINFO);
	assert(points.has('/'), 'root mount is listed');
	assert(points.has(TRUSTED_CONFIG_MOUNT), 'the 9p config mount is listed by its mount point');
	assert(points.has('/app/with space'), 'octal escapes in mount points are decoded');
	assert(!points.has(''), 'blank lines do not produce a mount point');
}

function testTrustedMountAllowance(): void {
	const refused = fakeIo({ chmodError: 'EPERM', modeAfterChmod: 0o777, mounted: true });
	const outcome = securePosixSecretPath(TRUSTED_CONFIG_MOUNT, 'directory', refused);
	assert(
		outcome === 'trusted-mount',
		'a refused chmod on the mounted config directory is trusted',
	);
	assert(refused.chmodCalls[0] === 0o700, 'the repair was still attempted before trusting');

	const file = `${TRUSTED_CONFIG_MOUNT}/app.json`;
	const refusedFile = fakeIo({ chmodError: 'EPERM', modeAfterChmod: 0o777, mounted: true });
	assert(
		securePosixSecretPath(file, 'file', refusedFile) === 'trusted-mount',
		'a refused chmod on a file inside the mount is trusted',
	);

	const silent = fakeIo({ modeAfterChmod: 0o777, mounted: true });
	assert(
		securePosixSecretPath(`${TRUSTED_CONFIG_MOUNT}/app.secrets.json`, 'file', silent) ===
			'trusted-mount',
		'a chmod the mount accepts but ignores is trusted',
	);

	const repaired = fakeIo({ modeAfterChmod: 0o600, mounted: true });
	assert(
		securePosixSecretPath(file, 'file', repaired) === 'repaired',
		'a mount that honours chmod reports an ordinary repair',
	);
}

function testFailClosed(): void {
	const unmounted = fakeIo({ chmodError: 'EPERM', modeAfterChmod: 0o755, mounted: false });
	throws(
		() => securePosixSecretPath(TRUSTED_CONFIG_MOUNT, 'directory', unmounted),
		`Unable to secure secret path ${TRUSTED_CONFIG_MOUNT} (EPERM)`,
		'a bare /app/config that is not a mount point fails closed',
	);

	const lookalike = '/app/configuration/app.json';
	const prefixTrap = fakeIo({ chmodError: 'EPERM', modeAfterChmod: 0o644, mounted: true });
	throws(
		() => securePosixSecretPath(lookalike, 'file', prefixTrap),
		`Unable to secure secret path ${lookalike} (EPERM)`,
		'a sibling path sharing the boundary prefix is not inside the boundary',
	);

	const ordinary = '/srv/app/config/app.json';
	const broad = fakeIo({ modeAfterChmod: 0o644, mounted: true });
	throws(
		() => securePosixSecretPath(ordinary, 'file', broad),
		`Secret path permissions remain broader than owner-only: ${ordinary}`,
		'an ordinary file whose mode stays broad fails closed',
	);
	assert(
		broad.mountReads === 0,
		'the mount table is consulted only for paths under the boundary',
	);

	const broadDir = fakeIo({ modeAfterChmod: 0o755, mounted: true });
	throws(
		() => securePosixSecretPath('/srv/app/config', 'directory', broadDir),
		'Secret path permissions remain broader than owner-only: /srv/app/config',
		'an ordinary directory whose mode stays broad fails closed',
	);

	const denied = fakeIo({ chmodError: 'EACCES', modeAfterChmod: 0o644, mounted: true });
	throws(
		() => securePosixSecretPath(ordinary, 'file', denied),
		`Unable to secure secret path ${ordinary} (EACCES)`,
		'an ordinary chmod failure surfaces the path and errno only',
	);
}

function testRepairOnThisOs(): void {
	const temp = mkdtempSync(join(tmpdir(), 'spernakit-secret-acl-'));
	const secretPath = join(temp, 'fixture.secrets.json');
	writeFileSync(secretPath, '{"token":"fixture-only"}', 'utf8');

	if (process.platform === 'win32') {
		const broad = spawnSync('icacls', [secretPath, '/grant', '*S-1-1-0:(R)'], {
			encoding: 'utf8',
			windowsHide: true,
		});
		if (broad.status !== 0) {
			throw new Error(`Could not create broad ACL fixture at ${secretPath}`);
		}
	} else {
		chmodSync(temp, 0o755);
		chmodSync(secretPath, 0o644);
	}

	secureSecretPath(temp, 'directory');
	secureSecretPath(secretPath, 'file');
	assert(
		readFileSync(secretPath, 'utf8') === '{"token":"fixture-only"}',
		'permission repair leaves secret-file contents untouched',
	);

	if (process.platform === 'win32') {
		const acl = spawnSync('icacls', [secretPath], {
			encoding: 'utf8',
			windowsHide: true,
		}).stdout;
		const entries = acl
			.split(/\r?\n/)
			.map((line, index) => (index === 0 ? line.replace(secretPath, '') : line).trim())
			.map((line) => line.match(/^(.+?):\(/)?.[1])
			.filter((identity): identity is string => identity !== undefined);
		const username = userInfo().username.toLowerCase();
		assert(
			entries.every((identity) => identity.toLowerCase().endsWith(`\\${username}`)),
			`secret fixture has only owner ACL entries at ${secretPath}`,
		);
	} else {
		assert(
			(statSync(secretPath).mode & 0o777) === 0o600,
			`secret fixture mode is owner-only at ${secretPath}`,
		);
	}

	try {
		rmSync(temp, { force: true, recursive: true });
	} catch {
		// A Windows scanner can briefly retain a handle; the fixture contains no operator secret.
	}
}

testMountTableParsing();
testTrustedMountAllowance();
testFailClosed();
testRepairOnThisOs();
console.log(
	`[OK] secret paths repair to owner-only on this OS and only the ${TRUSTED_CONFIG_MOUNT} mount ` +
		`boundary tolerates a refused chmod (${checks} checks)`,
);
