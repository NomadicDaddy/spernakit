#!/usr/bin/env bun
/**
 * Regression coverage for the rows-per-page control showing the rows-per-page it is set to.
 *
 * The defect this gate was written for: the table footer offered 10, 20, 30 and 50 while the
 * rows-per-page default is 25, so on a fresh account the Select was bound to a value none of its
 * items carried. Radix renders nothing at all in that case, so every table in the app opened with
 * an empty box where the page size should be, and the only way to make it show anything was to
 * pick a size the user had not asked for. The Preferences page offered a third list again, 10, 25,
 * 50 and 100, so the two controls over the same setting disagreed about what could be chosen.
 *
 * The property under test is that there is one list of choices, that the default is on it, and
 * that a size arriving from anywhere else is added to it rather than dropped. A control whose
 * value is not among its options cannot display that value, so keeping the value on the list is
 * what keeps the control readable.
 *
 * Two of the checks below read source rather than behaviour, because a second hardcoded list is
 * exactly how the first one got out of step and neither Select can be rendered without a browser.
 */
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The module the choices are supposed to live in. */
const SHARED_MODULE = 'frontend/src/lib/pageSize.ts';

/** The table footer's Select. */
const FOOTER = 'frontend/src/components/shared/data-table/DataTablePagination.tsx';

/** The Preferences page's Select over the same setting. */
const PREFERENCES = 'frontend/src/pages/profile/DisplayPreferences.tsx';

/** Where the server's copy of the default lives; the two are supposed to agree. */
const BACKEND_DEFAULTS = 'backend/src/services/user/userSettingsService.ts';

const failures: string[] = [];

/**
 * Record a failure when a condition does not hold.
 *
 * @param condition - The expectation being checked.
 * @param message - What was expected, phrased so the failure output reads on its own.
 */
function assert(condition: boolean, message: string): void {
	if (!condition) failures.push(message);
}

/**
 * Read a repository file.
 *
 * @param relativePath - Path from the repository root.
 * @returns The file's contents.
 */
function source(relativePath: string): string {
	return readFileSync(join(repoRoot, relativePath), 'utf-8');
}

/**
 * The part of the Preferences page that renders the items-per-page Select.
 *
 * @param text - The whole file.
 * @returns Just that Select, or the empty string when it cannot be found.
 */
function preferencesSelect(text: string): string {
	const start = text.indexOf('htmlFor="itemsPerPage"');
	if (start < 0) return '';
	const end = text.indexOf('</Select>', start);
	return end < 0 ? '' : text.slice(start, end);
}

async function run(): Promise<void> {
	let options: null | readonly number[] = null;
	let defaultSize = Number.NaN;
	let optionsFor: ((current: number) => number[]) | null = null;

	try {
		const shared = (await import(join(repoRoot, SHARED_MODULE))) as {
			DEFAULT_ITEMS_PER_PAGE: number;
			PAGE_SIZE_OPTIONS: readonly number[];
			pageSizeOptions: (current: number) => number[];
		};
		options = shared.PAGE_SIZE_OPTIONS;
		defaultSize = shared.DEFAULT_ITEMS_PER_PAGE;
		optionsFor = shared.pageSizeOptions;
	} catch {
		failures.push(
			`the rows-per-page choices live in one module, ${SHARED_MODULE}, so the table footer and the Preferences page cannot offer different lists`,
		);
	}

	if (options && optionsFor) {
		assert(
			options.includes(defaultSize),
			`the rows-per-page default (${String(defaultSize)}) is one of the offered choices, or the control opens showing nothing`,
		);
		assert(
			options.length >= 3 && options.every((size) => Number.isInteger(size) && size > 0),
			'the choices are whole positive row counts and there is more than a token few of them',
		);

		// A size can arrive from a saved preference, a URL or a server page limit, and any of those
		// can be a number that was never on the list.
		for (const current of [defaultSize, 20, 37, 100]) {
			const offered = optionsFor(current);
			assert(
				offered.includes(current),
				`a page size of ${String(current)} is offered when that is the size in force, so the control can show it`,
			);
			assert(
				offered.every((size, index) => index === 0 || size > (offered[index - 1] ?? 0)),
				`the choices offered alongside ${String(current)} are in ascending order with no repeats`,
			);
			assert(
				options.every((size) => offered.includes(size)),
				`offering ${String(current)} adds to the standard choices rather than replacing them`,
			);
		}
	}

	const footer = source(FOOTER);
	assert(
		footer.includes('pageSizeOptions') || footer.includes('PAGE_SIZE_OPTIONS'),
		`${FOOTER} takes its choices from ${SHARED_MODULE}`,
	);
	assert(
		!/\[\s*\d+\s*,/.test(footer),
		`${FOOTER} carries no list of row counts of its own; a second list is how the first one got out of step`,
	);

	const preferences = preferencesSelect(source(PREFERENCES));
	assert(preferences !== '', `${PREFERENCES} still renders an items-per-page Select`);
	assert(
		preferences.includes('pageSizeOptions') || preferences.includes('PAGE_SIZE_OPTIONS'),
		`${PREFERENCES} takes its choices from ${SHARED_MODULE} rather than listing them again`,
	);
	assert(
		!preferences.includes('<SelectItem value="'),
		`${PREFERENCES} carries no hardcoded row counts in its items-per-page Select`,
	);

	const backendDefault = /itemsPerPage:\s*(\d+)/.exec(source(BACKEND_DEFAULTS))?.[1];
	assert(
		backendDefault !== undefined && Number(backendDefault) === defaultSize,
		`the server's default items per page (${backendDefault ?? 'not found'}) matches the client's (${String(defaultSize)}), so a fresh account is not handed a size the control cannot show`,
	);

	if (failures.length > 0) {
		for (const failure of failures) console.error(`- ${failure}`);
		console.log(
			`[FAIL] page-size-options: ${String(failures.length)} of the rows-per-page rules do not hold`,
		);
		process.exit(1);
	}

	console.log(
		`[OK] page-size-options: 2 controls offer the same ${String(options?.length ?? 0)} choices, and the size in force is always one of them`,
	);
	process.exit(0);
}

run().catch((err: unknown) => {
	console.error('Fatal error in test-page-size-options:', err);
	process.exit(1);
});
