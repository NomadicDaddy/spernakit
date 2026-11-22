/**
 * Which characters of a source text are code, for check-git-window-hide.ts: a spawn written inside
 * a string, comment or regular expression is text, not a call, and a `windowsHide` mentioned in a
 * comment is not an option. Split out of that check, which keeps its own walk and its rules.
 *
 * smokestack owns this file and delivers it with `bun run shared-core:write`. Change it in
 * smokestack; every repository that takes it holds a byte-identical copy.
 */

/** The code character before which a `/` opens a regular expression rather than dividing. */
const BEFORE_REGEX = '(,=:[!&|?{};+-*%<>~^';

/**
 * The keywords after which a `/` opens a regular expression, as in `return /'/`. `of` is left out
 * on purpose: it is only a keyword inside `for (… of …)`, and anywhere else it is an ordinary name,
 * so `of / 2` divides (Morticia #13529). A regex directly after `for (x of` is the rarer case.
 */
const KEYWORDS_BEFORE_REGEX =
	/(?:^|[^\w$.])(?:await|case|delete|do|else|in|instanceof|new|return|throw|typeof|void|yield)\s*$/;

/** Whether the code just before `index` ends with one of those keywords, not a property name. */
function keywordBefore(text: string, index: number): boolean {
	return KEYWORDS_BEFORE_REGEX.test(text.slice(Math.max(0, index - 64), index));
}

/** The index just past the regular expression literal opening at `start`, or `start + 1`. */
function regexEnd(text: string, start: number): number {
	let inClass = false;
	for (let i = start + 1; i < text.length && text[i] !== '\n'; i++) {
		const char = text[i];
		if (char === '\\') i++;
		else if (char === '[') inClass = true;
		else if (char === ']') inClass = false;
		else if (char === '/' && !inClass) return i + 1;
	}
	return start + 1;
}

/**
 * Which characters of `text` are code rather than string, template text, regular expression or
 * comment. A template's `${…}` substitution is code again, however deeply it nests: a call inside
 * one runs. Built per line, so a string or comment that spans lines is judged from where it starts.
 */
export function codeMask(text: string): boolean[] {
	const mask = Array<boolean>(text.length).fill(false);
	/** For each open substitution, the brace depth outside it. */
	const substitutions: number[] = [];
	let braces = 0;
	let quote: null | string = null;
	let previous = '';
	for (let i = 0; i < text.length; i++) {
		const char = text[i] as string;
		const next = text[i + 1];
		if (quote !== null) {
			if (char === '\\') {
				i++;
			} else if (char === quote) {
				quote = null;
				previous = char;
			} else if (quote === '`' && char === '$' && next === '{') {
				substitutions.push(braces++);
				quote = null;
				previous = '{';
				i++;
			}
			continue;
		}
		if (char === '/' && next === '/') {
			const end = text.indexOf('\n', i);
			i = end === -1 ? text.length : end - 1;
		} else if (char === '/' && next === '*') {
			const end = text.indexOf('*/', i + 2);
			i = end === -1 ? text.length : end + 1;
		} else if (
			char === '/' &&
			(previous === '' || BEFORE_REGEX.includes(previous) || keywordBefore(text, i))
		) {
			i = regexEnd(text, i) - 1;
			previous = '/';
		} else if (char === "'" || char === '"' || char === '`') {
			quote = char;
		} else if (char === '}' && substitutions.at(-1) === braces - 1) {
			substitutions.pop();
			braces--;
			quote = '`';
		} else {
			if (char === '{') braces++;
			else if (char === '}') braces--;
			mask[i] = true;
			if (char.trim() !== '') previous = char;
		}
	}
	return mask;
}
