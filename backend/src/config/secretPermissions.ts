import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';

type SecretPathKind = 'directory' | 'file';

function runIcacls(args: string[]): string {
	const result = spawnSync('icacls', args, { encoding: 'utf8', windowsHide: true });
	if (result.status !== 0) {
		throw new Error(
			`Unable to secure secret path ${args[0]} (icacls exit ${result.status ?? 1})`,
		);
	}
	return result.stdout;
}

function aclIdentities(filePath: string, output: string): string[] {
	return output
		.split(/\r?\n/)
		.map((line, index) => (index === 0 ? line.replace(filePath, '') : line).trim())
		.map((line) => line.match(/^(.+?):\(/)?.[1])
		.filter((identity): identity is string => identity !== undefined);
}

function isCurrentIdentity(identity: string, username: string): boolean {
	const normalized = identity.toLowerCase();
	const user = username.toLowerCase();
	return normalized === user || normalized.endsWith(`\\${user}`);
}

function secureWindowsPath(filePath: string, kind: SecretPathKind): void {
	const username = userInfo().username;
	runIcacls([filePath, '/inheritance:r']);
	const existing = aclIdentities(filePath, runIcacls([filePath]));
	for (const identity of existing) {
		if (!isCurrentIdentity(identity, username)) runIcacls([filePath, '/remove', identity]);
	}
	const permission = kind === 'directory' ? '(OI)(CI)F' : '(F)';
	runIcacls([filePath, '/grant:r', `${username}:${permission}`]);
	const remaining = aclIdentities(filePath, runIcacls([filePath]));
	if (remaining.length === 0 || remaining.some((entry) => !isCurrentIdentity(entry, username))) {
		throw new Error(`Secret path permissions remain broader than owner-only: ${filePath}`);
	}
}

/** Deliberately repair a config or split-secret path before any secret content is read. */
function secureSecretPath(filePath: string, kind: SecretPathKind): void {
	if (!existsSync(filePath)) return;
	if (process.platform === 'win32') {
		secureWindowsPath(filePath, kind);
		return;
	}
	const expected = kind === 'directory' ? 0o700 : 0o600;
	chmodSync(filePath, expected);
	if ((statSync(filePath).mode & 0o777) !== expected) {
		throw new Error(`Secret path permissions remain broader than owner-only: ${filePath}`);
	}
}

export { secureSecretPath };
export type { SecretPathKind };
