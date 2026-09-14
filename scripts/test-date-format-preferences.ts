#!/usr/bin/env bun
/** Verifies stored date, time, language, and timezone preferences drive timestamp formatting. */
import { join } from 'node:path';

import {
	dateOptionsFor,
	formatDateByPreference,
	timeOptionsFor,
} from '../frontend/src/lib/dateTimePreferences.ts';

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
}

const instant = new Date('2026-01-02T15:04:05Z');
const timezone = 'America/New_York';
const dateFormatter = new Intl.DateTimeFormat('en-US', dateOptionsFor(timezone));
const expectedDates = new Map([
	['DD/MM/YYYY', '02/01/2026'],
	['MM/DD/YYYY', '01/02/2026'],
	['YYYY-MM-DD', '2026-01-02'],
]);
for (const [format, expected] of expectedDates) {
	assert(
		formatDateByPreference(dateFormatter, instant, format) === expected,
		`${format} must render as ${expected}`,
	);
}

const expectedTimes = new Map([
	['h:mm:ss AM/PM', '10:04:05 AM'],
	['h:mm AM/PM', '10:04 AM'],
	['HH:mm:ss', '10:04:05'],
	['HH:mm', '10:04'],
]);
for (const [format, expected] of expectedTimes) {
	const actual = new Intl.DateTimeFormat('en-US', timeOptionsFor(format, timezone)).format(
		instant,
	);
	assert(
		actual === expected,
		`${format} in ${timezone} must render as ${expected}, got ${actual}`,
	);
}

const boundary = new Date('2026-01-01T01:04:05Z');
assert(
	formatDateByPreference(dateFormatter, boundary, 'MM/DD/YYYY') === '12/31/2025',
	'a non-local timezone must affect the displayed calendar date',
);

const sharedPage = await Bun.file(
	join(import.meta.dir, '..', 'frontend/src/pages/dashboards/SharedDashboardPage.tsx'),
).text();
assert(sharedPage.includes('formatDateTime('), 'shared dashboard freshness must use useFormatters');
assert(
	!/\.toLocale(?:Date|Time|String)/.test(sharedPage),
	'shared page must not bypass preferences',
);

console.log('[OK] all stored date/time formats and timezone behavior reach template timestamps');
