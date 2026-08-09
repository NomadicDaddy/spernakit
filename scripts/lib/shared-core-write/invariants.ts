/**
 * The checks that guard the checker itself, rather than any target.
 *
 * None of them reads the synthetic fleet's write path, which is why they are not in the write
 * self-test beside the classification assertions: one is about a group being well-formed before any
 * target is looked at, one about a run that compared nothing being told apart from a run that found
 * nothing, one about the rosters those groups resolve through. All three exist because the failure
 * they catch reads as success.
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GroupReport } from '../shared-core/check.ts';
import type { SharedCoreGroup } from '../shared-core/manifest.ts';

import { assertHookChainIsCarried } from '../shared-core/owner.ts';
import { reportClean } from '../shared-core/vacuity.ts';
import { isInitExcluded } from '../template/exclusions.ts';
import { check, equal } from './harness.ts';

/**
 * Every checkGroup call in the suite already runs this validator against a well-formed group, which
 * is only half the evidence: a validator never seen rejecting is the vacuous gate the suite exists
 * to argue against. So arrange the defect of 2026-08-04 directly — a hook chaining a guard its group
 * does not deliver — and require the refusal.
 */
export function assertHookChainRule(group: SharedCoreGroup, owner: string): void {
	writeFileSync(
		join(owner, '.githooks', 'rogue'),
		'#!/bin/sh\n# bash "$d/mentioned-only.sh"\nbash "$d/unshipped.sh"\n',
	);
	const withRogue = {
		...group,
		files: [...group.files, { disposition: 'synced' as const, source: 'rogue' }],
		hook: 'rogue',
	};

	let refused = '';
	try {
		assertHookChainIsCarried(withRogue, owner);
	} catch (err) {
		refused = err instanceof Error ? err.message : String(err);
	}
	check('a hook chaining an unshipped guard is refused', refused.includes('unshipped.sh'));
	check(
		'a guard named only in a comment is not mistaken for one that is chained',
		refused.length > 0 && !refused.includes('mentioned-only.sh'),
	);
	assertHookChainIsCarried(group, owner);
	check('a group that carries everything its hook chains is accepted', true);
}

/**
 * The roster is the one file in this subsystem that names private sibling repositories, and the one
 * a derived app has no way to read: every reader of one is withheld from init. Both halves of that
 * arrangement were maintained by hand against a single roster name and neither moved when the
 * license-core sync became four groups, so three `*-targets.json.example` files shipped to all
 * eleven apps as instructions for a command those apps do not have. Hold the exclusion pattern and
 * the ignore rule to the manifest rather than to a remembered list, so a fifth group fails here
 * instead of shipping.
 */
export function assertRosterHygiene(groups: SharedCoreGroup[], root: string): void {
	const rosters = groups
		.filter((g) => g.owner === 'spernakit' && g.targets.model === 'roster')
		.map((g) => (g.targets.model === 'roster' ? g.targets.roster : ''));

	check('this repository owns at least one roster group', rosters.length > 0);
	// A name neither tracked nor ignored, asserted first: both predicates below are exit statuses, and
	// a git invocation that fails for an unrelated reason reads as "not tracked, not ignored" rather
	// than as an error. Probing a name that is genuinely neither is what tells a working predicate
	// from one that has stopped answering.
	check(
		'a name this repository does not carry is neither tracked nor ignored',
		!isTracked(root, 'zzz-no-such-roster.json.example') &&
			!isIgnored(root, 'zzz-no-such-roster.json'),
	);
	for (const roster of rosters) {
		check(`${roster} is withheld from init`, isInitExcluded(roster));
		check(`${roster}.example is withheld from init`, isInitExcluded(`${roster}.example`));
		check(`${roster}.example is tracked here`, isTracked(root, `${roster}.example`));
		check(`${roster} is gitignored here`, isIgnored(root, roster));
	}
}

/** Exit status of a git command run in `root`, with its output discarded. */
function gitSucceeds(root: string, args: string[]): boolean {
	return spawnSync('git', args, { cwd: root, stdio: 'ignore', windowsHide: true }).status === 0;
}

/**
 * Whether git tracks `path`, which is the property that matters and not the one `existsSync` reads.
 * The example roster exists to be shipped, so an untracked copy sitting in the working tree is the
 * exact failure this asserts against, and it passes a presence check.
 */
function isTracked(root: string, path: string): boolean {
	return gitSucceeds(root, ['ls-files', '--error-unmatch', '--', path]);
}

/**
 * Whether git ignores `path`, asked of git rather than by searching `.gitignore` for a literal line.
 * A rule that ignores the roster can be spelled several ways, live in a nested `.gitignore`, or come
 * from the global excludes file, and a substring search reports every one of those as unguarded.
 * `--no-index` keeps the answer about the rule: git otherwise reports a tracked path as not ignored
 * regardless of what matches it.
 */
function isIgnored(root: string, path: string): boolean {
	return gitSucceeds(root, ['check-ignore', '--no-index', '--quiet', '--', path]);
}

/**
 * A checker whose inputs are other repositories can report "no drift" having compared nothing, which
 * is the presence-over-content failure it exists to catch, turned on itself. Both zero-target cases
 * are arranged because only one of them is a defect and nothing else tells them apart.
 */
export function assertCleanRunVerdict(report: GroupReport): void {
	const empty = [{ ...report, findings: [], matched: 0, targets: 0 }];
	equal('a lone clone skips rather than passing', reportClean(empty), 0);
	equal('an --only that matched nothing fails', reportClean(empty, new Set(['nope'])), 1);
	equal('a run with targets still passes', reportClean([{ ...report, findings: [] }]), 0);
}
