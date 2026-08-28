#!/usr/bin/env bun
/**
 * Regression coverage for one bug report being able to name the report that replaced it
 * (`.aidd/features/remediation-20260827-bug-report-supersede-link`).
 *
 * The defect this gate was written for: a submitted report cannot be amended. `PATCH` changes the
 * status and nothing else and requires ADMIN, so a reporter who got something wrong could only file
 * a second report. Nothing connected the two, so the inbox showed two pieces of open work and the
 * only record that they were the same thing was a sentence inside one of them. The fleet sweep that
 * produced this record left four such pairs across four applications.
 *
 * The property under test is that the relationship is data rather than prose: it is set through the
 * API, read back from both ends, counted correctly by the default listing, and refused when it
 * would not describe a real correction.
 *
 * Runs in process against a throwaway temp-file SQLite database. The database, the seeded accounts,
 * and the readers each claim compares against live in `lib/bug-supersede-world.ts`.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { App, Session } from './lib/bug-supersede-world.ts';

import { listAll, readOne, startWorld, submit, supersede } from './lib/bug-supersede-world.ts';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures: string[] = [];
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * The reporter links their own correction to the report it replaces, and both ends say so.
 *
 * Spec 1, 2 and 3 together. The session doing the work is the OPERATOR who filed the reports, with
 * no administrator involved, because correcting one's own mistake is the ordinary case the record
 * was filed about. Reading the original back afterwards proves the link did not edit it: the
 * description is still the text that was submitted.
 */
async function reporterLinksOwnCorrection(app: App, reporter: Session): Promise<void> {
	const original = await submit(app, 'Export fails on the reports page', reporter);
	const correction = await submit(app, 'Export fails on every page, not only reports', reporter);

	const response = await supersede(app, original.id, correction.id, reporter);
	assert(
		response.status === 200,
		`the reporter must be able to supersede their own report, got ${String(response.status)}`,
	);
	if (response.status !== 200) return;

	const readOriginal = await readOne(app, original.id, reporter);
	const readCorrection = await readOne(app, correction.id, reporter);
	assert(
		readOriginal.supersededById === correction.id,
		`the superseded report must name its replacement, got ${JSON.stringify(readOriginal.supersededById)}`,
	);
	assert(
		readCorrection.supersedesIds.includes(original.id),
		`the correction must name what it replaced, got ${JSON.stringify(readCorrection.supersedesIds)}`,
	);
	assert(
		readOriginal.description === 'Export fails on the reports page',
		`superseding must not rewrite the original text, got ${JSON.stringify(readOriginal.description)}`,
	);
	assert(
		readOriginal.status === original.status,
		'superseding must not change the original report status',
	);
}

/**
 * The default listing leaves the superseded report out, and its total says so.
 *
 * Spec 5. The count is asserted alongside the rows because the whole point of the record is that a
 * pair of reports about one problem was being counted as two pieces of open work. A listing that
 * hid the row but kept the old total would reproduce the defect in the footer.
 */
async function defaultListingExcludesSuperseded(app: App, admin: Session): Promise<void> {
	const before = await listAll(app, admin, false);
	const includedBefore = await listAll(app, admin, true);
	const original = await submit(app, 'Filter chips overlap at 1440', admin);
	const correction = await submit(app, 'Filter chips overlap at every width', admin);

	const bothOpen = await listAll(app, admin, false);
	assert(
		bothOpen.total === before.total + 2,
		`two new reports must both count as open work before the link, got ${String(bothOpen.total)}`,
	);

	const response = await supersede(app, original.id, correction.id, admin);
	assert(response.status === 200, `linking the pair answered ${String(response.status)}`);
	if (response.status !== 200) return;

	const after = await listAll(app, admin, false);
	assert(
		after.total === bothOpen.total - 1,
		`the superseded report must stop counting as open work, got ${String(after.total)}`,
	);
	assert(
		!after.data.some((report) => report.id === original.id),
		'the superseded report must not appear in the default listing',
	);
	assert(
		after.data.some((report) => report.id === correction.id),
		'the correction must still appear in the default listing',
	);

	const included = await listAll(app, admin, true);
	assert(
		included.data.some((report) => report.id === original.id),
		'the superseded report must be reachable when the listing is asked to include it',
	);
	// Measured against the count taken before these two were filed, not against the default
	// listing: an earlier case in this gate already left a superseded report behind, so the two
	// totals differ by more than the one report this case superseded.
	assert(
		included.total === includedBefore.total + 2,
		`asking for superseded reports must count both of them, got ${String(included.total)}`,
	);
}

/**
 * A link that would not describe a real correction is refused, and nothing is written.
 *
 * Spec 6, all three cases. The cycle case matters most: two people correcting the same pair in
 * opposite directions would otherwise leave a loop in which neither report is current, and the loop
 * is unreachable through the UI because each end points at the other.
 */
async function invalidLinksAreRefused(app: App, admin: Session): Promise<void> {
	const first = await submit(app, 'Session drops after an idle hour', admin);
	const second = await submit(app, 'Session drops after any idle period', admin);
	const linked = await supersede(app, first.id, second.id, admin);
	assert(linked.status === 200, `linking the pair answered ${String(linked.status)}`);

	const itself = await supersede(app, second.id, second.id, admin);
	assert(
		itself.status === 400,
		`a report superseding itself must be refused with 400, got ${String(itself.status)}`,
	);

	const cycle = await supersede(app, second.id, first.id, admin);
	assert(
		cycle.status === 400,
		`superseding a report that already supersedes this one must be refused with 400, got ${String(cycle.status)}`,
	);

	const missing = await supersede(app, second.id, 999_999, admin);
	assert(
		missing.status === 404,
		`naming a report that does not exist must be refused with 404, got ${String(missing.status)}`,
	);

	const unchanged = await readOne(app, second.id, admin);
	assert(
		unchanged.supersededById === null,
		`a refused link must write nothing, got ${JSON.stringify(unchanged.supersededById)}`,
	);
	assert(
		unchanged.supersedesIds.includes(first.id),
		'the link that was accepted must survive the three that were refused',
	);
}

/**
 * A link filed against the wrong report can be taken off again.
 *
 * Not called out in the spec, but a supersede that cannot be undone is the same class of problem the
 * record is about: an uncorrectable mistake in a system that exists to let mistakes be corrected.
 */
async function clearingALinkRestoresOpenWork(app: App, admin: Session): Promise<void> {
	const original = await submit(app, 'Uploads stall above 10MB', admin);
	const wrong = await submit(app, 'Unrelated report linked by accident', admin);
	await supersede(app, original.id, wrong.id, admin);

	const cleared = await supersede(app, original.id, null, admin);
	assert(cleared.status === 200, `clearing a link answered ${String(cleared.status)}`);
	if (cleared.status !== 200) return;

	const readBack = await readOne(app, original.id, admin);
	assert(
		readBack.supersededById === null,
		`a cleared link must read back as null, got ${JSON.stringify(readBack.supersededById)}`,
	);
	const listing = await listAll(app, admin, false);
	assert(
		listing.data.some((report) => report.id === original.id),
		'a report whose link was cleared must count as open work again',
	);
}

async function run(): Promise<void> {
	const { admin, app, dispose, reporter } = await startWorld(repoRoot);

	await reporterLinksOwnCorrection(app, reporter);
	await defaultListingExcludesSuperseded(app, admin);
	await invalidLinksAreRefused(app, admin);
	await clearingALinkRestoresOpenWork(app, admin);

	await dispose();

	if (failures.length === 0) {
		console.log(
			'[OK] bug-report-supersede: a correction and the report it replaces name each other',
		);
		process.exit(0);
	}
	console.error('[FAIL] bug-report-supersede:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-bug-report-supersede:', err);
	process.exit(1);
});
