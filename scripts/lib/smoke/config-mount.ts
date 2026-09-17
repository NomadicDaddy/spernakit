/**
 * Host-side securing of the smoke config mount.
 *
 * `ensureDockerTestDirs` copies `config/*.json` into `${APPDATA_ROOT}/${APP_SLUG}/config`, which
 * the compose overlays bind-mount at `/app/config`. The container cannot restrict that directory
 * (see `TRUSTED_CONFIG_MOUNT` in `backend/src/config/secretPermissions.ts`), so the host does it
 * before the mount exists: the shared guard makes the copy owner-only (Windows ACL, or POSIX 0700
 * and 0600), and on a Linux host whose user is not the image's `bun` uid the container identity
 * receives a read-only POSIX ACL entry so the mounted files stay readable without going world-wide.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { secureSecretPath } from '../../../backend/src/config/secretPermissions.ts';

/** The Dockerfile's non-root `bun` user: the only identity that reads the mount in the container. */
const CONTAINER_UID = 1000;

function grantContainerRead(target: string, access: 'r' | 'rx'): void {
	const result = spawnSync('setfacl', ['-m', `u:${CONTAINER_UID}:${access}`, target], {
		encoding: 'utf8',
	});
	if (result.error || result.status !== 0) {
		const reason = result.error ? 'setfacl unavailable' : `setfacl exit ${result.status ?? 1}`;
		throw new Error(
			`Unable to grant container uid ${CONTAINER_UID} read access to ${target} (${reason}); ` +
				`install the acl package or run the smoke as uid ${CONTAINER_UID}`,
		);
	}
}

/**
 * Secure the copied smoke config before the container mounts it. Owner-only first, then the
 * container-uid read grant on Linux hosts that need it. Diagnostics name paths only.
 */
export function secureConfigMount(configDir: string): void {
	const files = readdirSync(configDir)
		.filter((entry) => entry.endsWith('.json'))
		.map((entry) => join(configDir, entry));
	secureSecretPath(configDir, 'directory');
	for (const file of files) secureSecretPath(file, 'file');
	if (process.platform === 'win32' || process.getuid?.() === CONTAINER_UID) return;
	grantContainerRead(configDir, 'rx');
	for (const file of files) grantContainerRead(file, 'r');
}
