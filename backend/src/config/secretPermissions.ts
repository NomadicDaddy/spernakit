import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync } from 'node:fs';
import { userInfo } from 'node:os';

type SecretPathKind = 'directory' | 'file';
type SecretPathOutcome = 'repaired' | 'trusted-mount';

/**
 * The one container path where a foreign filesystem may refuse owner-only repair. Every compose
 * file bind-mounts the operator's config directory here, and the Dockerfile's non-root `bun` user
 * cannot chmod what the host owns: a Windows Docker Desktop (9p/drvfs) mount answers EPERM, and a
 * Linux host directory owned by another uid does the same. The host secures the directory before
 * mounting it (`scripts/lib/smoke/config-mount.ts` for smoke runs, the operator for staging and
 * production), so a refused chmod *at this boundary* is the mount contract, not a broken guard.
 * The allowance also requires the boundary to be an actual mount point: a bare `/app/config` baked
 * into the image is owned by `bun` and must repair like any other path.
 */
const TRUSTED_CONFIG_MOUNT = '/app/config';

/** POSIX primitives, injectable so the mount contract is testable on any host. */
interface PosixSecretIo {
	chmod: (filePath: string, mode: number) => void;
	/** Permission bits (`mode & 0o777`) as the filesystem reports them after chmod. */
	mode: (filePath: string) => number;
	/** Mount points of the current mount namespace (`/proc/self/mountinfo` field five). */
	mountPoints: () => ReadonlySet<string>;
}

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

/**
 * Mount points from `/proc/self/mountinfo` text: field five of every line, with the kernel's octal
 * escapes (`\040` for a space in the path) decoded.
 */
function parseMountPoints(mountinfo: string): Set<string> {
	const points = new Set<string>();
	for (const line of mountinfo.split('\n')) {
		const mountPoint = line.split(' ')[4];
		if (!mountPoint) continue;
		points.add(
			mountPoint.replace(/\\(\d{3})/g, (_match, octal: string) =>
				String.fromCharCode(parseInt(octal, 8)),
			),
		);
	}
	return points;
}

function readMountPoints(): Set<string> {
	try {
		return parseMountPoints(readFileSync('/proc/self/mountinfo', 'utf8'));
	} catch {
		// No Linux mount table (macOS, BSD): nothing is a trusted mount and the guard stays closed.
		return new Set();
	}
}

const posixIo: PosixSecretIo = {
	chmod: chmodSync,
	mode: (filePath) => statSync(filePath).mode & 0o777,
	mountPoints: readMountPoints,
};

function errnoCode(err: unknown): string {
	return err instanceof Error && 'code' in err && typeof err.code === 'string'
		? err.code
		: 'unknown error';
}

function isWithinTrustedMount(filePath: string, io: PosixSecretIo): boolean {
	const within =
		filePath === TRUSTED_CONFIG_MOUNT || filePath.startsWith(`${TRUSTED_CONFIG_MOUNT}/`);
	return within && io.mountPoints().has(TRUSTED_CONFIG_MOUNT);
}

/**
 * POSIX repair: chmod to owner-only and confirm the bits took. Inside the trusted config mount the
 * host owns those bits, so a refused chmod or an unchanged mode there is accepted; anywhere else
 * both stay fatal. Diagnostics carry the path and errno only, never file content.
 */
function securePosixSecretPath(
	filePath: string,
	kind: SecretPathKind,
	io: PosixSecretIo = posixIo,
): SecretPathOutcome {
	const expected = kind === 'directory' ? 0o700 : 0o600;
	const trusted = isWithinTrustedMount(filePath, io);
	try {
		io.chmod(filePath, expected);
	} catch (err) {
		if (trusted && errnoCode(err) === 'EPERM') return 'trusted-mount';
		throw new Error(`Unable to secure secret path ${filePath} (${errnoCode(err)})`, {
			cause: err,
		});
	}
	if (io.mode(filePath) === expected) return 'repaired';
	if (trusted) return 'trusted-mount';
	throw new Error(`Secret path permissions remain broader than owner-only: ${filePath}`);
}

/** Deliberately repair a config or split-secret path before any secret content is read. */
function secureSecretPath(filePath: string, kind: SecretPathKind): void {
	if (!existsSync(filePath)) return;
	if (process.platform === 'win32') {
		secureWindowsPath(filePath, kind);
		return;
	}
	securePosixSecretPath(filePath, kind);
}

export { parseMountPoints, securePosixSecretPath, secureSecretPath, TRUSTED_CONFIG_MOUNT };
export type { PosixSecretIo, SecretPathKind };
