/**
 * Standalone verification for the destructive-confirmation evidence resolver.
 *
 * Exercises the real `scripts/lib/destructive/evidence.ts` exports (enclosingFunction,
 * hasConfirmationEvidence, EVIDENCE_WINDOW_LINES) against fixtures built here, so no repository
 * file has to hold a shape just to be measured. `check:destructive-confirmation` reports on the
 * eight call sites this repository happens to have; this asserts the resolver behind it.
 *
 * Both halves matter and the second is why the file exists. The resolver was extended to see a
 * `useCallback` handler, and the first attempt allowed any wrapping call before the parameter list.
 * `const ids = selectedRows.map((u) => u.id)` matched that, sits at the same depth as the statement
 * under it, and so was read as a closed sibling: `UsersTab.tsx:79` stopped resolving the
 * `function handleBulkDelete()` two lines above it and the gate reported a confirmed site as
 * unconfirmed. Running the gate caught it. Nothing else would have, because a resolver that
 * resolves too little and one that resolves too much both leave the repository green until the one
 * file with the shape shows up.
 *
 * Run: bun scripts/test-destructive-evidence.ts
 */
import {
	enclosingFunction,
	EVIDENCE_WINDOW_LINES,
	hasConfirmationEvidence,
} from './lib/destructive/evidence.ts';

let failures = 0;
function expect(cond: boolean, msg: string): void {
	if (!cond) {
		console.error(`  [FAIL] ${msg}`);
		failures++;
	} else {
		console.log(`  [OK] ${msg}`);
	}
}

/** Filler wider than the window, so a fixture spanning it is resolvable only through the hop. */
const GAP = Array<string>(EVIDENCE_WINDOW_LINES + 5).fill('');

interface Fixture {
	/** Expected `enclosingFunction` result at the destructive line. */
	enclosing: null | string;
	/** Expected `hasConfirmationEvidence` result at the destructive line. */
	evidence: boolean;
	name: string;
	/** A `// gap` line on its own expands to GAP; the single `.mutate(` line is the call site. */
	source: string;
}

function locate(source: string): { index: number; lines: string[] } {
	const lines = source.split('\n').flatMap((line) => (line.trim() === '// gap' ? GAP : [line]));
	return { index: lines.findIndex((line) => line.includes('.mutate(')), lines };
}

const HOP_FIXTURES: Fixture[] = [
	{
		enclosing: 'handleDelete',
		evidence: true,
		name: 'function declaration',
		source: `
	function handleDelete() {
		deleteEpisode.mutate(id);
	}
// gap
	return <ConfirmAlertDialog onConfirm={handleDelete} />;
`,
	},
	{
		enclosing: 'handleDelete',
		evidence: true,
		name: 'arrow binding',
		source: `
	const handleDelete = async () => {
		deleteEpisode.mutate(id);
	};
// gap
	return <ConfirmAlertDialog onConfirm={handleDelete} />;
`,
	},
	{
		enclosing: 'handleDelete',
		evidence: true,
		name: 'useCallback',
		source: `
	const handleDelete = useCallback(() => {
		deleteEpisode.mutate(id);
	}, [deleteEpisode, id]);
// gap
	return <ConfirmAlertDialog onConfirm={handleDelete} />;
`,
	},
	{
		enclosing: 'handleDelete',
		evidence: true,
		name: 'async useCallback',
		source: `
	const handleDelete = useCallback(async () => {
		await deleteEpisode.mutate(id);
	}, [deleteEpisode, id]);
// gap
	return <ConfirmAlertDialog onConfirm={handleDelete} />;
`,
	},
	{
		enclosing: 'handleDelete',
		evidence: true,
		name: 'namespaced useCallback',
		source: `
	const handleDelete = React.useCallback(() => {
		deleteEpisode.mutate(id);
	}, [deleteEpisode, id]);
// gap
	return <ConfirmAlertDialog onConfirm={handleDelete} />;
`,
	},
	{
		enclosing: 'handleDelete',
		evidence: true,
		// Prettier moves the parameter list to its own line once the arguments outrun the print width,
		// and the resolver required it on the declaration line. A handler resolved or not depending on
		// how long its dependency array happened to be.
		name: 'useCallback whose parameter list prettier wrapped to the next line',
		source: `
	const handleDelete = useCallback(
		async (episodeId: string, options: DeleteOptions) => {
			await deleteEpisode.mutate(episodeId, options);
		},
		[deleteEpisode],
	);
// gap
	return <ConfirmAlertDialog onConfirm={handleDelete} />;
`,
	},
	{
		enclosing: 'handleBulkDelete',
		evidence: true,
		name: 'a mapped const above the call does not shadow the handler',
		source: `
	function handleBulkDelete() {
		const ids = selectedRows.map((u) => u.id);
		bulkDeleteMutation.mutate(ids, {
			onSuccess: () => clearSelection(),
		});
	}
// gap
	return <ConfirmAlertDialog onConfirm={handleBulkDelete} />;
`,
	},
];

const REFUSAL_FIXTURES: Fixture[] = [
	{
		enclosing: 'handleDelete',
		evidence: false,
		name: 'no confirmation primitive anywhere',
		source: `
	const handleDelete = useCallback(() => {
		deleteEpisode.mutate(id);
	}, [deleteEpisode, id]);
// gap
	return <Button onClick={handleDelete} />;
`,
	},
	{
		enclosing: 'handleDelete',
		evidence: false,
		name: 'confirmation names a different handler',
		source: `
	const handleDelete = useCallback(() => {
		deleteEpisode.mutate(id);
	}, [deleteEpisode, id]);
// gap
	return <ConfirmAlertDialog onConfirm={handleArchive} />;
`,
	},
	{
		enclosing: null,
		evidence: false,
		name: 'a closed sibling at the same depth is not borrowed',
		source: `
	const handleArchive = useCallback(() => {
		archive(id);
	}, [id]);
	deleteEpisode.mutate(id);
// gap
	return <ConfirmAlertDialog onConfirm={handleArchive} />;
`,
	},
	{
		enclosing: null,
		evidence: false,
		// The wrapped form accepts a line that ends at the open paren, which is only safe while the
		// wrapper has to be `useCallback` by name. Any-call-then-newline would readmit exactly the
		// `UsersTab.tsx:79` misresolution the header describes, one line further down.
		name: 'a wrapped call that is not useCallback is not a declaration either',
		source: `
	const ids = selectedRows.map(
		(u) => u.id,
	);
		deleteEpisode.mutate(ids);
// gap
	return <ConfirmAlertDialog onConfirm={ids} />;
`,
	},
	{
		enclosing: null,
		evidence: false,
		name: 'a const bound to a call is not a declaration',
		source: `
	const config = loadConfig(defaults);
		deleteEpisode.mutate(id);
// gap
	return <ConfirmAlertDialog onConfirm={config} />;
`,
	},
];

function check(fixtures: Fixture[]): void {
	for (const item of fixtures) {
		const { index, lines } = locate(item.source);
		const enclosing = enclosingFunction(lines, index);
		const evidence = hasConfirmationEvidence(lines, index);
		expect(
			enclosing === item.enclosing,
			`${item.name}: enclosingFunction === ${String(item.enclosing)} (got ${String(enclosing)})`,
		);
		expect(
			evidence === item.evidence,
			`${item.name}: hasConfirmationEvidence === ${item.evidence}`,
		);
	}
}

console.log('--- handler hop resolves each declaration form (confirmation beyond the window) ---');
check(HOP_FIXTURES);

console.log('\n--- the hop refuses what it cannot actually follow ---');
check(REFUSAL_FIXTURES);

console.log('\n--- the window alone still carries a site the hop cannot reach ---');
{
	const { index, lines } = locate(`
	<ConfirmAlertDialog
		onConfirm={() => {
			deleteEpisode.mutate(id);
		}}
	/>
`);
	expect(
		hasConfirmationEvidence(lines, index) === true,
		'inline dispatch inside a confirmation dialog has evidence in the window',
	);
}

if (failures > 0) {
	console.error(`\n[FAIL] ${failures} assertion(s) failed.`);
	process.exit(1);
}
console.log('\n[OK] All destructive-evidence assertions passed.');
