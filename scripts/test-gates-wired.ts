#!/usr/bin/env bun
/** Regression test for check:gates-wired, run against throwaway fixtures. */
import { strict as assert } from 'node:assert';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runGatesWiredCheck } from './check-gates-wired.ts';

interface Excuse {
	reason?: string;
	script?: string;
}

const fixtureParent = mkdtempSync(join(tmpdir(), 'gates-wired-'));
let fixtures = 0;

function fixture(scripts: string[], commands: string[], excusedTests?: Excuse[]): string {
	fixtures += 1;
	const root = join(fixtureParent, `case-${String(fixtures)}`);
	mkdirSync(join(root, 'scripts'), { recursive: true });
	const scriptMap: Record<string, string> = {};
	for (const name of scripts) {
		const [script, command] = name.split('=');
		if (script !== undefined) scriptMap[script] = command ?? `bun scripts/${script}.ts`;
	}
	writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: scriptMap }));
	const steps = commands.map((command) => ({ command, description: command }));
	const smoke = { modes: { qc: { steps } }, ...(excusedTests ? { excusedTests } : {}) };
	writeFileSync(join(root, 'scripts', 'smoke.json'), JSON.stringify(smoke));
	return root;
}

function findings(root: string): string {
	return runGatesWiredCheck(root).findings.join('\n');
}

try {
	const wired = runGatesWiredCheck(
		fixture(['test:a', 'test:b', 'lint'], ['bun run test:a', 'bun run test:b --mode dev']),
	);
	assert.equal(wired.code, 0, 'wired scripts pass, with or without trailing arguments');
	assert.equal(wired.examined, 2, 'only test:* scripts are examined');

	assert.match(
		findings(fixture(['test:a', 'test:b'], ['bun run test:a'])),
		/test:b is run by no step/,
		'an unwired script fails',
	);

	// The control that matters: a longer name must not wire its own prefix.
	assert.match(
		findings(
			fixture(['test:server', 'test:server-services'], ['bun run test:server-services']),
		),
		/test:server is run by no step/,
		'a prefix of a wired name is not wired',
	);

	assert.match(
		findings(fixture(['test:a'], ['bun scripts/test-a.ts'])),
		/test:a is run by no step/,
		'naming the file is not running the script',
	);

	const chain = 'test:both=bun scripts/test:part.ts && bun scripts/other.ts';
	assert.equal(
		runGatesWiredCheck(fixture(['test:part', chain], ['bun run test:both'])).code,
		0,
		'a script whose whole command a wired script chains is run',
	);
	assert.match(
		findings(fixture(['test:part', chain], [])),
		/test:part is run by no step/,
		'a chain from an unwired script wires nothing',
	);

	const excused = fixture(['test:live'], [], [{ reason: 'needs a device', script: 'test:live' }]);
	assert.equal(runGatesWiredCheck(excused).code, 0, 'an excuse with a reason passes');

	assert.match(
		findings(fixture(['test:live'], [], [{ script: 'test:live' }])),
		/excused without a reason/,
		'an excuse needs a reason',
	);
	assert.match(
		findings(fixture(['test:live'], [], [{ reason: '  ', script: 'test:live' }])),
		/excused without a reason/,
		'a blank reason is no reason',
	);
	assert.match(
		findings(fixture([], [], [{ reason: 'needs a device', script: 'test:gone' }])),
		/test:gone is excused but is not a script/,
		'an excuse for a script that no longer exists fails',
	);
	assert.match(
		findings(
			fixture(['test:a'], ['bun run test:a'], [{ reason: 'was slow', script: 'test:a' }]),
		),
		/test:a is excused but a smoke step runs it/,
		'an excuse for a wired script fails',
	);

	console.log('[OK] check:gates-wired regression test passed.');
} finally {
	rmSync(fixtureParent, { force: true, recursive: true });
}
