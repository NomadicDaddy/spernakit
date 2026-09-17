/**
 * The scan behind the dialog-form-survival gate.
 *
 * A dialog hands its form to a callback and gets nothing back. The mutation the parent starts
 * resolves later, and it can resolve as a refusal. A handler that clears the fields on the way out
 * of the submit therefore clears them whatever the server goes on to say, and the operator is left
 * looking at an empty form, a toast that has already faded, and no way to recover what they typed.
 *
 * This finds that shape: a body-level handler that clears state a control renders and, in the same
 * synchronous pass, hands the work to somebody else. Clearing after an awaited call is a different
 * thing and is left alone, because an await is the answer arriving. So is clearing in a mutation's
 * own `onSuccess`, for the same reason. A close notification is not a submission, so a handler
 * whose only handoff is `onOpenChange` or `onClose` is not what this looks for.
 */
import { readFileSync } from 'node:fs';

/** A `const [name, setName] = useState` pair, which is what makes a variable state. */
const STATE_DECLARATION = /const \[(\w+), (set\w+)\] = useState/g;

/**
 * A control's own value.
 *
 * State that reaches one of these attributes is state somebody typed. Everything else a dialog
 * holds, an error message, a pending flag, a step counter, is the component's own bookkeeping and
 * costs nothing to throw away.
 */
const TYPED_BINDING = /\b(?:checked|defaultValue|value)=\{([^}]*)\}/g;

/**
 * A body-level function, either declared or assigned to a const. One leading tab is the body.
 *
 * The arrow is required rather than assumed, so that a `const` holding a value, or a call with an
 * object argument such as `useMutation({ ... })`, is not read as a handler. A mutation's own
 * `onSuccess` is the sanctioned place to clear a form, and it lives inside exactly that shape.
 */
const BLOCK_START = /^\t(?:function (\w+)\s*\(|const (\w+) = (?:async )?(?:\([^)]*\)|\w+) =>)/;

/**
 * Handing work to somebody who answers later.
 *
 * `onOpenChange` and `onClose` are excluded by name: they report that the dialog is closing, which
 * is the one moment clearing the form is unremarkable.
 */
const HANDOFF = /\.mutate(?:Async)?\(|\bon(?!Close\b|OpenChange\b)[A-Z]\w*\(/;

interface Offender {
	/** What the handler clears: a state setter, or the helper that calls one. */
	clears: string;
	/** 1-based line of the handler's first line. */
	line: number;
	/** The handler's name. */
	name: string;
	/** Repository-relative path, forward slashes. */
	path: string;
}

/** Whitespace and trailing commas carry no meaning here, and formatting moves both. */
function collapse(text: string): string {
	return text
		.replace(/,(\s*[)\]}])/gu, '$1')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * The argument list of the first call at or after `from`, without its parentheses.
 *
 * @param text - The source to read.
 * @param from - Where to start looking for the opening parenthesis.
 * @returns The argument text, or null when the call is not closed.
 */
function callArgument(text: string, from: number): null | string {
	const open = text.indexOf('(', from);
	if (open === -1) return null;
	let depth = 0;
	for (let i = open; i < text.length; i += 1) {
		if (text[i] === '(') depth += 1;
		else if (text[i] === ')') {
			depth -= 1;
			if (depth === 0) return text.slice(open + 1, i);
		}
	}
	return null;
}

/** The lines of a body-level block, from its first line to the closing brace at the same depth. */
function blockLines(lines: string[], start: number): string[] {
	const block: string[] = [];
	for (let i = start; i < lines.length; i += 1) {
		block.push(lines[i] ?? '');
		if (i > start && /^\t\}/.test(lines[i] ?? '')) break;
	}
	return block;
}

/** The setter for each piece of state a control renders, with the value it started at. */
function typedState(text: string): Map<string, { initial: string; setter: string }> {
	const rendered = new Set<string>();
	for (const [, binding] of text.matchAll(TYPED_BINDING)) {
		for (const [, word] of (binding ?? '').matchAll(/\b([A-Za-z_$][\w$]*)/g)) {
			if (word) rendered.add(word);
		}
	}

	const state = new Map<string, { initial: string; setter: string }>();
	for (const match of text.matchAll(STATE_DECLARATION)) {
		const [, name, setter] = match;
		if (!name || !setter || !rendered.has(name)) continue;
		const initial = callArgument(text, match.index + match[0].length);
		if (initial !== null) state.set(setter, { initial: collapse(initial), setter });
	}
	return state;
}

/** The setter this block puts back to its starting value, if it puts any back. */
function clearedBy(
	block: string,
	state: Map<string, { initial: string; setter: string }>,
): null | string {
	const flat = collapse(block);
	for (const [setter, { initial }] of state) {
		let at = flat.indexOf(`${setter}(`);
		while (at !== -1) {
			const argument = callArgument(flat, at);
			if (argument !== null && collapse(argument) === initial) return setter;
			at = flat.indexOf(`${setter}(`, at + 1);
		}
	}
	return null;
}

/**
 * Every handler that throws away what the user typed before the submission it started has answered.
 *
 * @param repoRoot - The repository root, used to shorten the reported paths.
 * @param files - Absolute paths of the frontend sources to read.
 * @returns One entry per offending handler, in the order the files were given.
 */
function findEarlyFormResets(repoRoot: string, files: string[]): Offender[] {
	const offenders: Offender[] = [];

	for (const file of files) {
		const text = readFileSync(file, 'utf8');
		if (!text.includes('<Dialog')) continue;

		const state = typedState(text);
		if (state.size === 0) continue;

		const lines = text.split('\n');
		const blocks: { body: string; line: number; name: string }[] = [];
		for (let i = 0; i < lines.length; i += 1) {
			const line = lines[i] ?? '';
			const start = BLOCK_START.exec(line);
			if (!start || !line.endsWith('{')) continue;
			blocks.push({
				body: blockLines(lines, i).join('\n'),
				line: i + 1,
				name: start[1] ?? start[2] ?? '',
			});
		}

		// A handler that calls `resetDialog()` clears the form just as surely as one that calls the
		// setter itself, so the helpers have to be resolved before the handlers are judged.
		const helpers = new Set(
			blocks
				.filter((b) => clearedBy(b.body, state) !== null && !HANDOFF.test(b.body))
				.map((b) => b.name),
		);

		for (const block of blocks) {
			if (!HANDOFF.test(block.body) || /\bawait\b/.test(block.body)) continue;
			const direct = clearedBy(block.body, state);
			const helper = [...helpers].find(
				(name) => name !== block.name && new RegExp(`\\b${name}\\(`).test(block.body),
			);
			const clears = direct ?? helper;
			if (clears === undefined || clears === null) continue;
			offenders.push({
				clears,
				line: block.line,
				name: block.name,
				path: file.slice(repoRoot.length + 1).replaceAll('\\', '/'),
			});
		}
	}

	return offenders;
}

export { findEarlyFormResets };
export type { Offender };
