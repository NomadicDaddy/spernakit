/**
 * The `AHEAD` expiry marker on `.templateoverrides` SKIP and KEEP entries.
 *
 * An app that takes a change before the template does (a fleet hook sync, a security fix landed in
 * the app first) suppresses that file with SKIP or KEEP until the template carries the same change.
 * Written as free text, that intent is invisible to every tool, so the entry outlives the reason for
 * it and hides drift on the very files it covers. One derived app kept four leak-guard and hook
 * files SKIPped "AHEAD" of its recorded tag for weeks after the template had caught up.
 *
 * The marker makes the expiry machine-readable. It is the start of the entry's reason:
 *
 *   KEEP  .githooks/pre-commit  # AHEAD until 3.52.0: fleet hook sync, remove when v3.52.0 ships it
 *   SKIP  scripts/check.ts      # AHEAD until blob 2ebe968b72: waiting for this template blob
 *
 * `until <X.Y.Z>` expires when the upgrade target reaches or passes that template version. `until blob
 * <hash>` expires when the target template's blob for the entry's template path matches the hash (a
 * git blob id, 7 to 40 hex characters, compared as a prefix). Anything after the expiry is the human
 * reason. A reason that starts with `AHEAD` but names no parseable expiry is malformed: the parser
 * warns with its line, and the entry behaves as an ordinary override.
 */

/** When an AHEAD entry stops being needed. */
export type AheadExpiry = { hash: string; kind: 'blob' } | { kind: 'version'; version: string };

/** One parsed AHEAD entry, kept beside the action maps by loadTemplateOverrides. */
export interface AheadEntry {
	action: 'KEEP' | 'SKIP';
	/** The normalised app path, as in the action maps. */
	appPath: string;
	expiry: AheadExpiry;
	/** The 1-based `.templateoverrides` line, so a failure points at what to edit. */
	line: number;
}

/**
 * The `ahead` map's key. KEEP and SKIP on one path are separate entries in the action maps, so each
 * keeps its own expiry, and a later line for the same action and path replaces only its own.
 */
export function aheadKey(action: 'KEEP' | 'SKIP', appPath: string): string {
	return `${action} ${appPath}`;
}

const MARKER = /^AHEAD\b/u;
const VERSION_EXPIRY = /^AHEAD until (\d+\.\d+\.\d+)(?![\w.])/u;
const BLOB_EXPIRY = /^AHEAD until blob ([0-9a-f]{7,40})(?![\w])/u;

/**
 * Read the marker at the start of `reason`.
 *
 * Returns null when the reason is not an AHEAD reason at all (the entry is unchanged), the expiry
 * when it parses, or 'malformed' when it says AHEAD without a usable expiry.
 */
export function parseAheadMarker(reason: string): 'malformed' | AheadExpiry | null {
	if (!MARKER.test(reason)) return null;
	const blob = BLOB_EXPIRY.exec(reason);
	if (blob?.[1] !== undefined) return { hash: blob[1], kind: 'blob' };
	const version = VERSION_EXPIRY.exec(reason);
	if (version?.[1] !== undefined) return { kind: 'version', version: version[1] };
	return 'malformed';
}

/** -1, 0 or 1 as `a` is below, equal to or above `b`, both `X.Y.Z`. */
export function compareVersions(a: string, b: string): number {
	const left = a.split('.').map(Number);
	const right = b.split('.').map(Number);
	for (let i = 0; i < 3; i++) {
		const difference = (left[i] ?? 0) - (right[i] ?? 0);
		if (difference !== 0) return difference < 0 ? -1 : 1;
	}
	return 0;
}

export interface ExpiryInput {
	ahead: Map<string, AheadEntry>;
	/** The target template's blob id for a template path, or null when it has none. */
	blobAt: (templatePath: string) => null | string;
	targetVersion: string;
	/** Maps an app path to the template path it is compared against (scaffold mapping). */
	toTemplatePath: (appPath: string) => string;
}

/**
 * One message per AHEAD entry the selected target has made obsolete, naming the entry and file.
 *
 * The comparison is against the upgrade target, never the app's recorded pin: an app on an old pin
 * upgrading straight to an expired target is exactly the case that must be caught before the copy.
 */
export function expiredAheadEntries(input: ExpiryInput): string[] {
	const expired: string[] = [];
	for (const entry of input.ahead.values()) {
		const { appPath } = entry;
		const where = `${entry.action} ${appPath} (.templateoverrides line ${String(entry.line)})`;
		if (entry.expiry.kind === 'version') {
			if (compareVersions(input.targetVersion, entry.expiry.version) >= 0) {
				expired.push(
					`${where} is AHEAD until ${entry.expiry.version}, and the target v${input.targetVersion} has reached it. Remove the entry and take the template's copy.`,
				);
			}
			continue;
		}
		const templatePath = input.toTemplatePath(appPath);
		const blob = input.blobAt(templatePath);
		if (blob?.startsWith(entry.expiry.hash) === true) {
			expired.push(
				`${where} is AHEAD until blob ${entry.expiry.hash}, and v${input.targetVersion}'s ${templatePath} is that blob. Remove the entry and take the template's copy.`,
			);
		}
	}
	return expired;
}
