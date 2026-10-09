/**
 * Paths a derived app receives from the shared-core sync rather than from a template release.
 *
 * Those files are governed twice otherwise. check:shared-core holds every copy to the owning
 * repository's current version and fails on any difference. The drift check then compared the same
 * files to the release the app is pinned to, which lags whenever a guard changes between releases.
 * The second comparison added no protection; it only failed every derived app after each guard sync
 * until the next dance (2026-10-09: leak-guard.sh, pre-push and check-leak-guard.sh at v3.47.3).
 * The drift check skips these paths and says so, and the shared-core check stays the one that fails.
 */
import { existsSync } from 'node:fs';
import { join, posix } from 'node:path';

import { loadManifest } from '../shared-core/manifest.ts';

/**
 * Every app-relative path a fleet-wide shared-core group writes, read from the template's own
 * manifest. Only `discovered` groups count: they target every repository under the fleet root,
 * derived apps included. A `roster` group names its targets, which derived apps are not, so its
 * files still reach an app through the template and stay drift-checked here.
 */
export function sharedCoreGovernedPaths(scriptsDir: string): Set<string> {
	const governed = new Set<string>();
	// A template with no shared-core manifest has nothing to hand off. An invalid manifest still
	// throws through loadManifest: an unreadable exclusion list must never silently exclude nothing.
	if (!existsSync(join(scriptsDir, 'shared-core-manifest.json'))) return governed;
	for (const group of loadManifest(scriptsDir)) {
		if (group.targets.model !== 'discovered') continue;
		for (const file of group.files) {
			governed.add(posix.normalize(posix.join(group.targetRoot, file.target ?? file.source)));
		}
	}
	return governed;
}
