#!/usr/bin/env bun
/**
 * Regression self-test for the roots line the shared-core sync prints.
 *
 * Phillip's #8053 rule: a scanner covers every repo-holding root or says which it skipped and why.
 * Until 2026-10-10 the sweep's output named no root at all, so a clean report could not be told
 * apart from a complete one (#8058). This pins the statement both ways: with no list, the line says
 * no other root was considered; with one, it names every skipped root and its reason. It also pins
 * the refusals, because a list that quietly drops a reason or claims a sweep nothing performs would
 * rebuild the gap it closes.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { exit } from 'node:process';

import { describeRoots, loadFleetRoots, ROOTS_FILE } from './lib/shared-core/roots.ts';

const failures: string[] = [];
function check(label: string, ok: boolean): void {
	if (!ok) failures.push(label);
}
function throws(label: string, run: () => unknown, fragment: string): void {
	try {
		run();
		failures.push(`${label}: did not throw`);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (!message.includes(fragment)) failures.push(`${label}: threw "${message}"`);
	}
}

const fleet = mkdtempSync(join(tmpdir(), 'shared-core-roots-'));
const writeRoots = (value: unknown): void =>
	writeFileSync(join(fleet, ROOTS_FILE), JSON.stringify(value));

try {
	const absent = loadFleetRoots(fleet);
	check('an absent list skips nothing', absent.file === null && absent.skip.length === 0);
	check(
		'an absent list is stated, not mistaken for coverage',
		describeRoots(fleet, absent).includes('no other root was considered'),
	);

	writeRoots({ skip: { '../other': 'not an application root' } });
	const line = describeRoots(fleet, loadFleetRoots(fleet));
	check('the line names the scanned root', line.includes(`scanned ${fleet}`));
	check(
		'the line names the skipped root and its reason',
		line.includes(`${join(fleet, '..', 'other')} (not an application root)`),
	);

	writeRoots({ skip: { '../other': '  ' } });
	throws('a skip with no reason', () => loadFleetRoots(fleet), 'must state why');
	writeRoots({ scan: ['../other'], skip: {} });
	throws('a key nothing reads', () => loadFleetRoots(fleet), 'unsupported key');
	writeRoots(['../other']);
	throws('a list that is not an object', () => loadFleetRoots(fleet), 'expected an object');
} finally {
	rmSync(fleet, { force: true, recursive: true });
}

if (failures.length > 0) {
	console.error('[FAIL] shared-core roots:');
	for (const failure of failures) console.error(`  - ${failure}`);
	exit(1);
}
console.log('[OK] shared-core roots: the output names every root scanned and skipped.');
