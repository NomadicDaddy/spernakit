/**
 * The two checks that guard the checker itself, rather than any target.
 *
 * Neither reads the synthetic fleet's write path, which is why they are not in the write self-test
 * beside the classification assertions: one is about a group being well-formed before any target is
 * looked at, the other about a run that compared nothing being told apart from a run that found
 * nothing. Both exist because the failure they catch reads as success.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GroupReport } from '../shared-core/check.ts';
import type { SharedCoreGroup } from '../shared-core/manifest.ts';

import { assertHookChainIsCarried } from '../shared-core/owner.ts';
import { reportClean } from '../shared-core/vacuity.ts';
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
