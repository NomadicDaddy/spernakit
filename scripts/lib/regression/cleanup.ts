/**
 * Removing a regression run's directory without leaving its secrets behind.
 *
 * A run directory holds config/ with the generated private keys, the case databases, and the logs.
 * The tree it lives in can be mirrored whatever .gitignore says, so the keys must not survive a
 * removal that stops part-way: on Windows a database a backend has not quite released makes rmSync
 * throw, even with force. Every removal here therefore takes config/ first and tries each entry on
 * its own, so one locked file never shields the rest, and reports every path it could not remove
 * instead of throwing at the first.
 */
import { type Dirent, existsSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

function describe(path: string, err: unknown): string {
	return `${path} (${err instanceof Error ? err.message : String(err)})`;
}

/**
 * Remove every entry of `dir` that `keep` does not keep, config/ first, each with its own catch.
 * Returns each path it could not remove, with the reason.
 */
export function removeEntries(dir: string, keep: (entry: Dirent) => boolean): string[] {
	if (!existsSync(dir)) return [];
	let entries: Dirent[];
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch (err) {
		return [describe(dir, err)];
	}
	const names = entries
		.filter((entry) => !keep(entry))
		.map((entry) => entry.name)
		.sort((a, b) => Number(b === 'config') - Number(a === 'config'));
	const failed: string[] = [];
	for (const name of names) {
		const path = join(dir, name);
		try {
			rmSync(path, { force: true, recursive: true });
		} catch (err) {
			failed.push(describe(path, err));
		}
	}
	return failed;
}

/**
 * Remove a whole run directory: its entries config-first, then owner.json, then the directory.
 * owner.json goes last on purpose: while anything else remains, it is what lets a later run's
 * abandoned-run cleanup (removeAbandonedRuns) recognise the directory and try again, so a lock
 * that clears later never strands the directory.
 */
export function removeRunDir(dir: string): string[] {
	const failed = removeEntries(dir, (entry) => entry.name === 'owner.json');
	if (failed.length > 0 || !existsSync(dir)) return failed;
	const last = removeEntries(dir, () => false);
	if (last.length > 0) return last;
	try {
		rmdirSync(dir);
	} catch (err) {
		return [describe(dir, err)];
	}
	return [];
}

/**
 * Strip a failed run down to its diagnostics: keep logs, login-error screenshots and owner.json
 * (which a later run's abandoned-run cleanup needs to clear the directory); remove the rest.
 */
export function keepOnlyEvidence(dir: string): string[] {
	return removeEntries(
		dir,
		(entry) => entry.isFile() && /\.(?:log|png)$|^owner\.json$/u.test(entry.name),
	);
}
