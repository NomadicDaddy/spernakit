/**
 * The scan behind the render-phase-sync gate.
 *
 * React lets a component adjust state during render, and the template uses that on purpose in
 * several places: a tab that follows a stored id, a bell that follows an unread count, a dialog
 * that seeds itself from the record it was opened for. The pattern is only safe when the guard
 * compares against a sentinel that nothing but the guard itself writes. Compare against the state
 * the user is editing and the guard defeats itself, because editing is what makes the comparison
 * true again.
 */
import { readFileSync } from 'node:fs';

/** A `const [name, setName] = useState(...)` pair, which is what makes a variable state. */
const STATE_DECLARATION = /const \[(\w+), (set\w+)\] = useState/g;

/** A guard at component-body level. One leading tab is the body; deeper is a callback. */
const BODY_GUARD = /^\tif \((.+)\) \{$/;

interface Offender {
	/** The state the guard compares against, which something outside the guard also writes. */
	guardedOn: string;
	/** 1-based line of the `if`. */
	line: number;
	/** Repository-relative path, forward slashes. */
	path: string;
	/** The state the guard replaces. */
	resets: string;
}

/** The lines of the guard's block, from its `if` to the closing brace at the same depth. */
function guardBlock(lines: string[], start: number): string[] {
	const block: string[] = [];
	for (let i = start; i < lines.length; i += 1) {
		block.push(lines[i] ?? '');
		if (i > start && /^\t\}/.test(lines[i] ?? '')) break;
	}
	return block;
}

/** Whether `name` appears in `text` as an identifier rather than inside a longer word. */
function mentions(text: string, name: string): boolean {
	return new RegExp(`\\b${name}\\b`).test(text);
}

/**
 * Whether the component renders this state into a JSX attribute.
 *
 * State that reaches an attribute is state a control can write back, which is what makes a
 * guard comparing against it self-defeating: the user changing the control is exactly what
 * arms the guard again. State that never leaves the component body cannot be changed that way,
 * which is what makes it usable as a sentinel.
 */
function boundIntoJsx(text: string, name: string): boolean {
	return new RegExp(`=\\{[^}]*\\b${name}\\b`).test(text);
}

/**
 * Every render-phase guard that compares against state the user can change.
 *
 * @param repoRoot - The repository root, used to shorten the reported paths.
 * @param files - Absolute paths of the frontend sources to read.
 * @returns One entry per offending guard, in the order the files were given.
 */
function findSelfDefeatingSyncs(repoRoot: string, files: string[]): Offender[] {
	const offenders: Offender[] = [];

	for (const file of files) {
		const text = readFileSync(file, 'utf8');
		const lines = text.split('\n');

		const setterFor = new Map<string, string>();
		for (const [, name, setter] of text.matchAll(STATE_DECLARATION)) {
			if (name && setter) setterFor.set(name, setter);
		}
		if (setterFor.size === 0) continue;

		for (let i = 0; i < lines.length; i += 1) {
			const guard = BODY_GUARD.exec(lines[i] ?? '');
			if (!guard) continue;

			const block = guardBlock(lines, i).join('\n');
			const condition = guard[1] ?? '';

			// A render-phase sync is a guard that resets state. Which state it resets does not decide
			// anything; what the guard compares against does.
			const resets = [...setterFor].find(([, setter]) => block.includes(`${setter}(`));
			if (!resets) continue;

			for (const [name] of setterFor) {
				if (!mentions(condition, name)) continue;

				// State a control renders is state the user can write. A guard comparing against it is
				// armed again by the very editing it is meant to leave alone, so the field can never
				// hold anything but the value the guard puts back.
				if (!boundIntoJsx(text, name)) continue;

				offenders.push({
					guardedOn: name,
					line: i + 1,
					path: file.slice(repoRoot.length + 1).replaceAll('\\', '/'),
					resets: resets[0],
				});
			}
		}
	}

	return offenders;
}

export { findSelfDefeatingSyncs };
export type { Offender };
