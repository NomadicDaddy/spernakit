/**
 * Resolves the repositories a group applies to.
 *
 * Two models, because the two existing syncs genuinely differ. The license core names its four
 * siblings in a gitignored roster; the hook installers sweep for a marker directory and take
 * whatever they find. Neither can be expressed as the other: a roster cannot arm a repository
 * nobody remembered to add, and discovery cannot express a subset chosen by hand.
 *
 * NO GROUP NAMES A TARGET REPOSITORY. This manifest is tracked in repositories that are published,
 * and a private sibling's name in a tracked file is the exact disclosure .githooks/leak-guard.sh
 * exists to stop. A roster group names a gitignored FILE; a discovered group names a MARKER.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SharedCoreGroup } from './manifest.ts';

export interface Target {
	/** Directory name beside the fleet root, used for reporting. */
	directory: string;
	/** Expected package.json "name", when the roster pins one. */
	packageName?: string;
	path: string;
}

function readRoster(ownerRoot: string, roster: string): null | string[] {
	const path = join(ownerRoot, roster);

	// Absent is not an error, and this is load-bearing rather than lenient. CI checks out one
	// repository, so there is nothing beside it to verify; an adopter of this template has no
	// siblings at all. Both must leave the gate green, or the gate gets removed from CI.
	if (!existsSync(path)) return null;
	const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
	if (!Array.isArray(parsed)) throw new Error(`${path}: expected an array of target entries.`);
	return parsed as string[];
}

function rosterTargets(group: SharedCoreGroup, fleetRoot: string, ownerRoot: string): Target[] {
	if (group.targets.model !== 'roster') return [];
	const entries = readRoster(ownerRoot, group.targets.roster);
	if (entries === null) return [];

	return entries.map((entry, index) => {
		const raw: Record<string, unknown> =
			typeof entry === 'string'
				? { directory: entry }
				: entry !== null && typeof entry === 'object'
					? (entry as Record<string, unknown>)
					: {};
		const directory = raw['directory'];
		const packageName = raw['packageName'] ?? directory;
		if (
			typeof directory !== 'string' ||
			directory.length === 0 ||
			directory !== directory.trim() ||
			directory === '.' ||
			directory === '..' ||
			/[\\/]/u.test(directory)
		) {
			throw new Error(
				`${group.targets.model === 'roster' ? group.targets.roster : ''}: entry ${index} ` +
					'directory must be one sibling directory name.',
			);
		}
		return {
			directory,
			path: join(fleetRoot, directory),
			...(typeof packageName === 'string' ? { packageName } : {}),
		};
	});
}

function discoveredTargets(group: SharedCoreGroup, fleetRoot: string, owner: string): Target[] {
	if (group.targets.model !== 'discovered') return [];
	const { marker } = group.targets;

	return readdirSync(fleetRoot, { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && !entry.name.endsWith('.old'))
		.filter((entry) => entry.name !== owner)
		.map((entry) => ({ directory: entry.name, path: join(fleetRoot, entry.name) }))
		.filter((t) => existsSync(join(t.path, '.git')) && existsSync(join(t.path, marker)));
}

export function resolveTargets(
	group: SharedCoreGroup,
	fleetRoot: string,
	ownerRoot: string,
): Target[] {
	return group.targets.model === 'roster'
		? rosterTargets(group, fleetRoot, ownerRoot)
		: discoveredTargets(group, fleetRoot, group.owner);
}

/** Reads a target's package.json scripts. Returns null when the repository has no package.json. */
export function readScripts(repoPath: string): null | Record<string, string> {
	const path = join(repoPath, 'package.json');
	if (!existsSync(path)) return null;
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8')) as {
			scripts?: Record<string, string>;
		};
		return parsed.scripts ?? {};
	} catch {
		return null;
	}
}
