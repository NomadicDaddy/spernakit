/**
 * The read-only half of the shared-core sync: compare, classify, never write.
 *
 * Detection ships before the write path on purpose. It is the gate, it is independently useful, and
 * it cannot break anything — whereas a write path built first has nothing to prove it is correct
 * except the writes it already made.
 *
 * The classification below is the whole design. A file that is ABSENT in a target and a file that
 * is PRESENT AND DIFFERENT are not the same problem: the first is a repository this rollout has not
 * reached yet, the second is a repository running a stale copy of a guard while reporting as
 * covered. Only the second fails the gate. Collapsing them would make this red on day one across a
 * fleet the write path has not been built for, and a gate that is red by construction gets removed.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { SharedCoreFile, SharedCoreGroup } from './manifest.ts';

import { hooksPath, readScripts, resolveTargets } from './targets.ts';

export type FindingKind =
	'drift' | 'foreign-hook' | 'local-chain' | 'uncovered' | 'unmanaged-dispatch' | 'unwired';

/**
 * `destination` and `source` are absolute paths, set only on the two kinds a write path may act on:
 * `uncovered` (deliver it) and `drift` (replace it). Every other kind leaves them undefined, which
 * is the mechanism rather than a convenience — the writer takes its worklist from these fields and
 * therefore cannot touch a file this checker did not already classify as writable. A foreign hook,
 * a hand-maintained chain, and a repository whose dispatcher is not ours are unwritable by
 * construction, not by a second copy of the rules that could fall out of step with these.
 */
export interface Finding {
	destination?: string;
	detail: string;
	group: string;
	kind: FindingKind;
	source?: string;
	target: string;
}

export interface GroupReport {
	findings: Finding[];
	group: string;
	matched: number;
	owner: string;
	skipped: string[];
	targets: number;
}

/**
 * Every source a group could install, including the fallback variants. All of them must exist in
 * the owning repository or the group is a description of something that is not there.
 */
function sourcesOf(file: SharedCoreFile): string[] {
	return file.fallbackSource === undefined ? [file.source] : [file.source, file.fallbackSource];
}

export function assertSourcesExist(group: SharedCoreGroup, ownerRoot: string): void {
	const missing = group.files
		.flatMap(sourcesOf)
		.filter((source) => !existsSync(join(ownerRoot, group.sourceRoot, source)));
	if (missing.length > 0) {
		throw new Error(
			`group '${group.name}': ${missing.length} source file(s) do not exist in ${group.owner} ` +
				`under ${group.sourceRoot}: ${missing.join(', ')}. A manifest naming files that are ` +
				'not there reports coverage it does not have.',
		);
	}
}

/** Picks the variant this target can actually run. */
function resolveSource(file: SharedCoreFile, scripts: null | Record<string, string>): string {
	if (file.requiresScripts === undefined) return file.source;
	const satisfied =
		scripts !== null && file.requiresScripts.every((name) => scripts[name] !== undefined);
	return satisfied ? file.source : (file.fallbackSource as string);
}

export function checkGroup(
	group: SharedCoreGroup,
	fleetRoot: string,
	ownerRoot: string,
): GroupReport {
	assertSourcesExist(group, ownerRoot);

	const report: GroupReport = {
		findings: [],
		group: group.name,
		matched: 0,
		owner: group.owner,
		skipped: [],
		targets: 0,
	};

	for (const target of resolveTargets(group, fleetRoot, ownerRoot)) {
		if (!existsSync(target.path)) {
			report.skipped.push(`${target.directory} (not checked out)`);
			continue;
		}
		const scripts = readScripts(target.path);
		if (group.requiresPackageJson === true && scripts === null) {
			report.skipped.push(`${target.directory} (no package.json)`);
			continue;
		}
		if (target.packageName !== undefined && scripts !== null) {
			const name = (
				JSON.parse(readFileSync(join(target.path, 'package.json'), 'utf8')) as {
					name?: string;
				}
			).name;
			if (name !== target.packageName) {
				throw new Error(
					`${target.directory}: expected package ${target.packageName}, found ${name ?? 'none'}.`,
				);
			}
		}
		report.targets += 1;

		// The dispatcher is conditional on the target's dispatcher, exactly as the full hook variant
		// is conditional on the script contract. One repository in this fleet reaches leak-guard.sh
		// through simple-git-hooks and never sets core.hooksPath; it IS covered, and writing a
		// .githooks/pre-commit there would install a file git never executes while reporting the
		// repository as current. The guards themselves stay unconditional — they need only bash and
		// git, which is why they already work under a foreign dispatcher.
		const dispatches = group.hook === undefined || hooksPath(target.path) === group.targetRoot;

		for (const file of group.files) {
			const name = file.target ?? file.source;
			const source = resolveSource(file, scripts);
			const sourcePath = join(ownerRoot, group.sourceRoot, source);
			const expected = readFileSync(sourcePath, 'utf8');
			const destination = join(target.path, group.targetRoot, name);

			if (name === group.hook && !dispatches) {
				report.findings.push({
					detail: `${name}: core.hooksPath does not resolve to ${group.targetRoot}; dispatch is not managed here`,
					group: group.name,
					kind: 'unmanaged-dispatch',
					target: target.directory,
				});
				continue;
			}
			if (!existsSync(destination)) {
				report.findings.push({
					destination,
					detail: `${group.targetRoot}/${name} is absent`,
					group: group.name,
					kind: 'uncovered',
					source: sourcePath,
					target: target.directory,
				});
				continue;
			}

			// Idempotence by content, never by presence. A presence check is what reported eleven
			// repositories as current while they ran a pre-push one generation behind.
			const actual = readFileSync(destination, 'utf8');
			if (actual === expected) {
				report.matched += 1;
				continue;
			}

			// Two ways a differing hook is NOT drift, both of which the existing installers already
			// honor and neither of which the write path may ever overwrite. A hook missing the
			// group's marker belongs to another tool; core.hooksPath holds one hook of each name, so
			// replacing it disables whatever was there. A hook carrying the local-chain marker is a
			// repository that deliberately maintains its own chain around the guard, which is a
			// correct configuration — calling it drift is how a check pressures someone into
			// reverting working code.
			if (name === group.hook) {
				if (group.hookMarker !== undefined && !actual.includes(group.hookMarker)) {
					report.findings.push({
						detail: `${name} exists and is not ours (no '${group.hookMarker}'); refusing to claim it`,
						group: group.name,
						kind: 'foreign-hook',
						target: target.directory,
					});
					continue;
				}
				if (
					group.localChainMarker !== undefined &&
					actual.includes(group.localChainMarker)
				) {
					report.findings.push({
						detail: `${name} is a hand-maintained local chain; the guard it carries was verified, the hook body is the target's own`,
						group: group.name,
						kind: 'local-chain',
						target: target.directory,
					});
					continue;
				}
			}

			// A seeded file is written once and never touched again, so a difference is the target
			// living its own life, which is the point. Only synced files can drift.
			if (file.disposition === 'seeded') {
				report.matched += 1;
				continue;
			}
			report.findings.push({
				destination,
				detail: `${group.targetRoot}/${name} differs from ${group.owner}${source === file.source ? '' : ` (variant ${source})`}`,
				group: group.name,
				kind: 'drift',
				source: sourcePath,
				target: target.directory,
			});
		}

		// Contains, not equals — see SharedCoreGroup.wiring for why, and for what each value has to
		// name so that a passing substring is real evidence rather than a looser test.
		for (const [key, required] of Object.entries(group.wiring ?? {})) {
			const script = scripts === null ? undefined : scripts[key];
			if (scripts !== null && (script === undefined || !script.includes(required))) {
				report.findings.push({
					detail: `package.json script '${key}' ${script === undefined ? 'is missing' : `does not run \`${required}\``}`,
					group: group.name,
					kind: 'unwired',
					target: target.directory,
				});
			}
		}
	}

	return report;
}

/** Drift is the only kind that fails the gate. See the header for why. */
export function isFatal(finding: Finding): boolean {
	return finding.kind === 'drift';
}
