#!/usr/bin/env bun
/**
 * Regression test for the `tests/regression-suite.md` parser.
 *
 * The suite is the one gate an application writes for itself, so the parser is what keeps it from
 * being quietly weakened: a commented-out case, a case that can never fail, a gap left by a deleted
 * case, or a selector that breaks the moment the page is restyled. Each refusal below is one of
 * those, and the last cases check that a sound suite parses into exactly the steps it says.
 */
import { strict as assert } from 'node:assert';

import { parseSuite, SuiteError, withRunId } from './lib/regression/suite.ts';

const SIGN_IN =
	'{ "role": "SYSOP", "steps": [{ "goto": "/login" }, { "signIn": true }, { "expectUrl": "/dashboard" }] }';

function suite(blocks: string[]): string {
	return blocks
		.map(
			(block, index) =>
				`## TC-${String(index + 1).padStart(3, '0')}: case ${String(index + 1)}\n\nProse.\n\n\`\`\`tc\n${block}\n\`\`\`\n`,
		)
		.join('\n');
}

function refuses(text: string, pattern: RegExp, label: string): void {
	assert.throws(
		() => parseSuite(text),
		(err: unknown) => err instanceof SuiteError && pattern.test(err.message),
		label,
	);
}

const five = (block: string = SIGN_IN): string[] => [block, SIGN_IN, SIGN_IN, SIGN_IN, SIGN_IN];

// ===== A sound suite parses into the steps it states. =====
const parsed = parseSuite(suite(five()));
assert.equal(parsed.length, 5, 'five cases parse');
assert.equal(parsed[0]?.id, 'TC-001', 'ids are kept');
assert.equal(parsed[0]?.title, 'case 1', 'titles are kept');
assert.deepEqual(parsed[0]?.steps[0], { goto: '/login' }, 'steps are kept in order');
const persistence =
	'{ "role": "SYSOP", "steps": [{ "signIn": true }, { "fill": { "testId": "name" }, "value": "rs-${runId}" }, { "click": { "role": "button", "name": "Save" } }, { "restartBackend": true }, { "signIn": true }, { "expectText": "rs-${runId}" }] }';
assert.equal(parseSuite(suite(five(persistence)))[0]?.steps.length, 6, 'a persistence case parses');
assert.equal(withRunId('rs-${runId}', 'abc'), 'rs-abc', 'the run id is the one substitution');

// ===== Size and numbering. =====
refuses(
	suite([SIGN_IN, SIGN_IN, SIGN_IN, SIGN_IN]),
	/4 case\(s\); it must have 5 to 10/,
	'four cases are too few',
);
refuses(
	suite(Array.from({ length: 11 }, () => SIGN_IN)),
	/11 case\(s\)/,
	'eleven cases are too many',
);
refuses(
	suite(five()).replace('TC-002', 'TC-003'),
	/found TC-003 where TC-002 belongs/,
	'a gap is refused',
);

// ===== Structure. =====
refuses(
	`${suite(five())}\n## TC-006: lonely\n\nNo block here.\n`,
	/TC-006 \(line \d+\) has no tc block/,
	'a heading without a block',
);
refuses(
	`\`\`\`tc\n${SIGN_IN}\n\`\`\`\n${suite(five())}`,
	/has no "## TC-NNN: title" heading/,
	'a block without a heading',
);
refuses(
	`${suite(five())}\n<!--\n## TC-006: off\n\`\`\`tc\n${SIGN_IN}\n\`\`\`\n-->\n`,
	/inside an HTML comment/,
	'a commented-out case is refused',
);
refuses(suite(five('{ "role": "SYSOP", "steps": [ }')), /not JSON/, 'bad JSON names the case');
refuses(
	suite(five('{ "role": "SYSOP", "steps": [{ "goto": "/x" }], "extra": 1 }')),
	/is \{ "role", "steps" \}/,
	'extra block keys are refused',
);

// ===== Steps. =====
refuses(
	suite(five('{ "role": "SYSOP", "steps": [{ "goto": "/login" }, { "signIn": true }] }')),
	/at least one expect step/,
	'a case that can never fail',
);
refuses(
	suite(five('{ "role": "SYSOP", "steps": [{ "hover": "/x" }, { "expectUrl": "/x" }] }')),
	/unknown step "hover"/,
	'an unknown action',
);
refuses(
	suite(
		five(
			'{ "role": "SYSOP", "steps": [{ "goto": "https://evil.example/" }, { "expectUrl": "/x" }] }',
		),
	),
	/same-origin/,
	'an absolute URL',
);
refuses(
	suite(
		five(
			'{ "role": "SYSOP", "steps": [{ "goto": "//evil.example/" }, { "expectUrl": "/x" }] }',
		),
	),
	/same-origin/,
	'a protocol-relative URL',
);
refuses(
	suite(
		five(
			'{ "role": "SYSOP", "steps": [{ "click": { "css": ".btn" } }, { "expectUrl": "/x" }] }',
		),
	),
	/a selector is/,
	'a CSS selector',
);
refuses(
	suite(
		five(
			'{ "role": "SYSOP", "steps": [{ "click": { "role": "button" } }, { "expectUrl": "/x" }] }',
		),
	),
	/a selector is/,
	'a role without a name',
);
refuses(
	suite(
		five(
			'{ "role": "SYSOP", "steps": [{ "signIn": true }, { "restartBackend": true }, { "expectUrl": "/x" }] }',
		),
	),
	/restartBackend needs a click or fill/,
	'a restart with nothing to persist',
);
refuses(
	suite(
		five(
			'{ "role": "SYSOP", "steps": [{ "goto": "/x", "click": { "testId": "a" } }, { "expectUrl": "/x" }] }',
		),
	),
	/exactly one action key/,
	'two actions in one step',
);

console.log('[OK] regression suite parser test passed.');
