/**
 * Standalone verification that `check-destructive-confirmation` reads code and not prose.
 *
 * Two halves. The first exercises `stripComments` directly, including the cases where it is
 * deliberately inexact. The second runs the real `runDestructiveConfirmation` against a fixture
 * project tree, because the four faults this covers are not all visible from the resolver: two of
 * them are about which lines become call sites and whether a waiver marker gets claimed, and those
 * only appear once the gate has walked a file.
 *
 * The fixtures are written to a temporary directory and removed afterwards. None of them can live
 * in `frontend/src`: a file holding a deliberately unconfirmed delete so a test can measure it is
 * indistinguishable, to the gate, from the defect the gate exists to find.
 *
 * Run: bun scripts/test-destructive-comments.ts
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runDestructiveConfirmation } from './check-destructive-confirmation.ts';
import { stripComments } from './lib/destructive/comments.ts';

let failures = 0;
function expect(cond: boolean, msg: string): void {
	if (!cond) {
		console.error(`  [FAIL] ${msg}`);
		failures++;
	} else {
		console.log(`  [OK] ${msg}`);
	}
}

console.log('--- stripComments ---');
{
	const cases: [string, string[], string[]][] = [
		['line comment', ['a(); // onConfirm'], ['a(); ']],
		['whole-line comment', ['\t// ConfirmAlertDialog'], ['\t']],
		['inline block', ['a(/* onConfirm */ b);'], ['a( b);']],
		[
			'block spanning lines',
			['/* onConfirm', ' * ConfirmDialog', ' */ a();', 'b();'],
			['', '', ' a();', 'b();'],
		],
		['jsx comment', ['\t{/* AlertDialog */}'], ['\t{}']],
		['string holding a marker', [`const s = '// onConfirm';`], [`const s = '// onConfirm';`]],
		['url in a string survives', [`fetch("https://x/y");`], [`fetch("https://x/y");`]],
		[
			'escaped quote does not end the string',
			[`const s = 'it\\'s // ok';`],
			[`const s = 'it\\'s // ok';`],
		],
		['indentation is preserved', ['\t\tdel(); // x'], ['\t\tdel(); ']],
		[
			// The continuation lines of a template are string content, not code. Read as code they let
			// a primitive named in prose stand as evidence for the call under it.
			'template literal carries across lines',
			['const s = `line one', '// ConfirmAlertDialog', 'line three`; // x'],
			['const s = `line one', '// ConfirmAlertDialog', 'line three`; '],
		],
		[
			// The other two quote characters cannot span a line, so an unterminated one must not read
			// the rest of the file as string content.
			'an unterminated single quote does not carry to the next line',
			[`const s = 'oops`, '\t// ConfirmAlertDialog'],
			[`const s = 'oops`, '\t'],
		],
	];
	for (const [name, input, want] of cases) {
		const got = stripComments(input);
		expect(
			got.length === want.length && got.every((line, i) => line === want[i]),
			`${name}: ${JSON.stringify(got)}`,
		);
	}
	// Inexact by design, and asserted so the bias stays visible: dropping evidence yields a finding
	// a reader can see, keeping prose yields a pass nobody sees.
	expect(
		stripComments(['<p>a // b</p>'])[0] === '<p>a ',
		'jsx text after // is dropped (over-strips rather than under-strips)',
	);
	expect(stripComments([]).length === 0, 'empty input yields empty output');
}

const HANDLER = `
export function Case() {
	const remove = useMutation();
`;

interface GateCase {
	/** Expected exit code from the gate. */
	code: number;
	name: string;
	/** Substring the gate must print. */
	says: string;
	source: string;
}

const GATE_CASES: GateCase[] = [
	{
		code: 1,
		name: 'a comment naming a primitive is not evidence',
		says: '1 destructive call site(s) with no confirmation',
		source: `${HANDLER}	function handleDelete() {
		// TODO: wrap this in a ConfirmAlertDialog before shipping
		deleteThing.mutate(id);
	}
	return <button onClick={handleDelete}>x</button>;
}
`,
	},
	{
		code: 0,
		name: 'a waiver whose reason names a primitive is honoured, not called stale',
		says: '1 destructive call site(s) examined, all confirmed',
		source: `${HANDLER}	function handleDelete() {
		// destructive-confirmation-allow: the operator types the full path to enable submit,
		// which is stronger than a ConfirmAlertDialog and matches none of its primitives
		deleteThing.mutate(id);
	}
	return <button onClick={handleDelete}>x</button>;
}
`,
	},
	{
		code: 0,
		name: 'a marker on the call site line itself is honoured',
		says: '1 destructive call site(s) examined, all confirmed',
		source: `${HANDLER}	function handleDelete() {
		deleteThing.mutate(id); // destructive-confirmation-allow: typed-path field, not a dialog
	}
	return <button onClick={handleDelete}>x</button>;
}
`,
	},
	{
		code: 0,
		name: 'a commented-out dispatch is not a call site',
		says: '1 destructive call site(s) examined, all confirmed',
		source: `${HANDLER}	function handleDelete() {
		// deleteThing.mutate(id);
		purgeThing.mutate(id);
	}
	return <ConfirmAlertDialog onConfirm={handleDelete} />;
}
`,
	},
	{
		code: 1,
		name: 'control: a genuinely unconfirmed dispatch is still a finding',
		says: '1 destructive call site(s) with no confirmation',
		source: `${HANDLER}	function handleDelete() {
		deleteThing.mutate(id);
	}
	return <button onClick={handleDelete}>x</button>;
}
`,
	},
];

console.log('\n--- the gate over fixture trees ---');
{
	const root = mkdtempSync(join(tmpdir(), 'destructive-'));
	const src = join(root, 'frontend', 'src');
	const log = console.log;
	const err = console.error;

	try {
		for (const item of GATE_CASES) {
			rmSync(src, { force: true, recursive: true });
			mkdirSync(src, { recursive: true });
			writeFileSync(join(src, 'Case.tsx'), item.source, 'utf-8');

			const output: string[] = [];
			const capture = (...args: unknown[]): void => void output.push(args.join(' '));
			console.log = capture;
			console.error = capture;
			let code: number;
			try {
				code = runDestructiveConfirmation(root);
			} finally {
				console.log = log;
				console.error = err;
			}

			const printed = output.join('\n');
			expect(code === item.code, `${item.name}: exit ${code} (want ${item.code})`);
			expect(
				printed.includes(item.says),
				`${item.name}: says "${item.says}"${printed.includes(item.says) ? '' : ` (got: ${printed.split('\n')[0]})`}`,
			);
		}
	} finally {
		rmSync(root, { force: true, recursive: true });
	}
}

if (failures > 0) {
	console.error(`\n[FAIL] ${failures} assertion(s) failed.`);
	process.exit(1);
}
console.log('\n[OK] All destructive-comment assertions passed.');
