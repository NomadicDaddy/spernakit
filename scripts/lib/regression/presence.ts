/**
 * Whether this repository must carry `tests/regression-suite.md`.
 *
 * The template always must. A derived application must from the template version that introduced
 * the suite (INTRODUCED_IN) onward: its upgrade to that version brings a starter suite with it, so
 * from then on a missing file means someone removed it. Below that version the step has nothing to
 * run and says so.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { compareVersions } from '../template/overrides-ahead.ts';

/** The Spernakit version whose changelog introduces test:regression-suite. */
export const INTRODUCED_IN = '3.51.3';
export const SUITE_FILE = join('tests', 'regression-suite.md');

export type Presence =
	| { kind: 'missing'; reason: string }
	| { kind: 'not-yet'; reason: string }
	| { kind: 'present'; path: string };

interface Manifest {
	name?: string;
	spernakit_version?: string;
}

export function suitePresence(root: string): Presence {
	const path = join(root, SUITE_FILE);
	if (existsSync(path)) return { kind: 'present', path };
	const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as Manifest;
	if (manifest.name === 'spernakit') {
		return { kind: 'missing', reason: `the template must carry ${SUITE_FILE}.` };
	}
	const pin = manifest.spernakit_version;
	if (pin === undefined) {
		return {
			kind: 'missing',
			reason: `package.json has no spernakit_version, so ${SUITE_FILE} is required.`,
		};
	}
	if (compareVersions(pin, INTRODUCED_IN) < 0) {
		return {
			kind: 'not-yet',
			reason: `this app is on Spernakit ${pin}; the suite starts at ${INTRODUCED_IN}.`,
		};
	}
	return {
		kind: 'missing',
		reason: `this app is on Spernakit ${pin}, at or after ${INTRODUCED_IN}, so ${SUITE_FILE} is required. Restore it, or start from the template's ${SUITE_FILE}.`,
	};
}
