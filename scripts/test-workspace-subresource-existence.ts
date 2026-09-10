/**
 * A workspace sub-resource answers 404 for a name that points at nothing.
 *
 * `GET /workspaces/:id/members` used to answer 200 with a member list for a workspace that had been
 * deleted, and the member writes used to succeed against it. Both read as a statement about the
 * workspace when the true answer is that there is no such workspace. Soft-deleting a workspace
 * leaves its membership rows behind, so a member still passed the membership guard for a workspace
 * the query layer had stopped returning, and passing the guard was taken as proof it was there.
 *
 * The claims are the shape of the fix rather than the fix itself. Claim 5 is checked here because
 * it reads source; the rest send requests and live in `lib/workspace-subresource-claims.ts`.
 *
 * 1. Every workspace sub-resource route, not only the one this was reported against, answers 404
 *    for an id that does not exist.
 * 2. The access check runs first and the existence check second, so a caller with no access hears
 *    403 for a real workspace and for an absent one and cannot use the status to find out which
 *    ids exist.
 * 3. An existing workspace answers exactly as it did, including one whose member list is
 *    legitimately empty, which is a different answer from a workspace that is not there.
 * 4. A soft-deleted workspace answers the way the sibling route already answers for one, to a
 *    member of it as well as to a SYSOP, and its member writes no longer succeed.
 * 5. The check has one owner. Every route naming a workspace in its path reaches a guard, and no
 *    route under `routes/` asks whether a workspace exists itself, so a route added later cannot
 *    answer for a deleted workspace by forgetting a line.
 * 6. The user named in a member add is subject to the same rule as the workspace named in the
 *    path. A user id no account carries answers 404 rather than a conflict over a membership that
 *    was never there, saying what the bulk route beside it says, and a real duplicate still
 *    answers 409.
 *
 * Run: `bun run test:workspace-subresource-existence`
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	checkAbsentAnswers404,
	checkAbsentUserIsNotAConflict,
	checkDuplicateStillConflicts,
	checkEmptyIsNotAbsent,
	checkExistingWorkspaceUnchanged,
	checkOutsiderCannotProbe,
	checkSoftDeletedMatchesSibling,
	checkSoftDeletedRejectsWrites,
} from './lib/workspace-subresource-claims.ts';
import {
	existenceChecksOutsideTheGuards,
	routesSkippingTheGuard,
	scopedRouteCount,
} from './lib/workspace-subresource-scan.ts';
import { assert, failedClaims } from './lib/workspace-subresource-tally.ts';
import { startWorld } from './lib/workspace-subresource-world.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Claim 5: the check has one owner, and no route can answer for a workspace without asking it. */
function checkOneOwner(): void {
	const counted = scopedRouteCount(repoRoot);
	assert(
		counted >= 6,
		`the scan must find the workspace routes it is asserting about, and found ${String(counted)}`,
	);

	const skipped = routesSkippingTheGuard(repoRoot);
	assert(
		skipped.length === 0,
		`every route naming a workspace in its path must reach a guard, which is what answers for a ` +
			`workspace that is not there; these do not: ${skipped.join(', ')}`,
	);

	const duplicated = existenceChecksOutsideTheGuards(repoRoot);
	assert(
		duplicated.length === 0,
		`only guards/workspaceAccess.ts may ask whether a workspace exists, because it is what orders ` +
			`the question after the access decision; these ask it themselves: ${duplicated.join(', ')}`,
	);
}

const { app, dispose, world } = await startWorld(repoRoot);
try {
	await checkAbsentAnswers404(app, world);
	await checkOutsiderCannotProbe(app, world);
	await checkEmptyIsNotAbsent(app, world);
	await checkExistingWorkspaceUnchanged(app, world);
	await checkSoftDeletedMatchesSibling(app, world);
	await checkSoftDeletedRejectsWrites(app, world);
	await checkAbsentUserIsNotAConflict(app, world);
	await checkDuplicateStillConflicts(app, world);
	checkOneOwner();
} finally {
	await dispose();
}

const failures = failedClaims();
if (failures.length > 0) {
	for (const failure of failures) console.error(`[FAIL] ${failure}`);
	console.error(
		`[FAIL] workspace sub-resource existence: ${String(failures.length)} claim(s) failed`,
	);
	process.exit(1);
}

console.log('[OK] every workspace sub-resource answers 404 for a name that points at nothing');
process.exit(0);
