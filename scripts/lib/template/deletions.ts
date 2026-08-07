/**
 * Detection of template paths a derived app should have stopped carrying.
 *
 * The ordinary drift checker only ever asks "does the app still match what the template ships?".
 * It is blind in the other direction: when the template REMOVES a file, that path simply stops
 * being enumerated, so an app that still carries the removed module looks perfectly clean. Nothing
 * fails, nothing warns, and the dead file survives every upgrade.
 *
 * That is not hypothetical. `backend/src/routes/auth/mfa-rate-limit.ts` — 34 lines, zero importers,
 * superseded by `backend/src/services/auth/mfaRateLimit.ts` — rode three derived apps' init commits
 * all the way from the version that shipped it to v3.31.2, through every intervening upgrade, and
 * was found by hand rather than by a gate.
 *
 * `.templateoverrides`' `DELETED` action already existed but only ever moved a `missing-in-app`
 * result to `suppressed`; it was a declaration an operator wrote, never a conclusion the tooling
 * reached. This module produces that conclusion.
 *
 * DELETED therefore covers both sides of one question — "is the absence of this path from the
 * template a problem?" — and the answer is recorded once, whichever direction the app leans:
 *   - template ships it, app dropped it     -> suppresses `missing-in-app` (pre-existing behavior)
 *   - template dropped it, app still has it -> suppresses `retained`       (added here)
 */
import type { TemplateOverrides } from './types.ts';

import { enumerateTemplateFiles } from './classify.ts';
import { fileExistsInApp } from './repo.ts';

export interface RetainedDeletion {
	filePath: string;
	status: 'retained' | 'suppressed';
	/** When status === 'suppressed', the reason recorded on the `.templateoverrides` DELETED line */
	suppression?: { action: 'DELETED'; reason: string };
}

export interface RetainedDeletionInput {
	/** True when the app still carries this app-relative path. */
	existsInApp: (filePath: string) => boolean;
	overrides: TemplateOverrides;
	/** Drift-managed app-relative paths at the app's recorded `spernakit_version`. */
	recordedPaths: readonly string[];
	/** Drift-managed app-relative paths at the target version. */
	targetPaths: readonly string[];
}

/**
 * Paths the recorded version shipped that the target version no longer ships, whether or not the
 * app still carries them.
 *
 * Both sides are the APP-relative sets from `enumerateTemplateFiles`, which is where `toTemplatePath`
 * is applied: a scaffold-mapped file lives at `scaffolding/.gitignore` in the template but reaches
 * the app as `.gitignore`, and both enumerations resolve it to the app path before this comparison
 * ever sees it. Comparing raw template paths instead would call `.gitignore` deleted at every
 * version, since no template tag has ever tracked that path at the app's location.
 *
 * Candidates are drawn only from what the recorded version shipped, so app-authored code — at paths
 * absent from both compared tags — can never enter the set.
 *
 * The drift checker uses this to hand these paths over to the deletion report entirely. Against the
 * recorded version a removed-then-deleted file reads as `missing-in-app` and a removed-then-edited
 * one reads as `drifted`, and both of those labels prescribe restoring a file the target does not
 * ship. Only the deletion report names the right remedy.
 */
export function findRemovedPaths(
	input: Pick<RetainedDeletionInput, 'recordedPaths' | 'targetPaths'>,
): Set<string> {
	const stillShipped = new Set(input.targetPaths);

	const removed = new Set<string>();
	for (const filePath of input.recordedPaths) {
		if (stillShipped.has(filePath)) continue;
		removed.add(filePath);
	}
	return removed;
}

/**
 * Removed paths the app still carries, sorted for a stable report.
 *
 * A removed path the app has already dropped is not reported: the app is correct, and there is
 * nothing to tell it.
 */
export function detectRetainedDeletions(input: RetainedDeletionInput): RetainedDeletion[] {
	const results: RetainedDeletion[] = [];
	for (const filePath of [...findRemovedPaths(input)].sort()) {
		if (!input.existsInApp(filePath)) continue;

		const reason = input.overrides.deleted.get(filePath);
		results.push(
			reason === undefined
				? { filePath, status: 'retained' }
				: { filePath, status: 'suppressed', suppression: { action: 'DELETED', reason } },
		);
	}
	return results;
}

export interface DeletionScan {
	deletions: RetainedDeletion[];
	/** Recorded-version paths the target no longer ships — excluded from the drift report. */
	removed: Set<string>;
	targetVersion: string;
}

/**
 * Compare the drift-managed path sets at the two versions.
 *
 * Both sides come from `enumerateTemplateFiles`, so both are app-relative: scaffold-mapped paths
 * (`scaffolding/.gitignore`) are already resolved through `toTemplatePath` to the app path they
 * land on, on both sides, before anything is compared.
 */
export function scanTemplateDeletions(
	repoRoot: string,
	spernakitPath: string,
	targetVersion: string,
	recordedPaths: string[],
	overrides: TemplateOverrides,
): DeletionScan {
	const input: RetainedDeletionInput = {
		existsInApp: (filePath: string): boolean => fileExistsInApp(repoRoot, filePath),
		overrides,
		recordedPaths,
		targetPaths: enumerateTemplateFiles(spernakitPath, targetVersion),
	};
	return {
		deletions: detectRetainedDeletions(input),
		removed: findRemovedPaths(input),
		targetVersion,
	};
}
