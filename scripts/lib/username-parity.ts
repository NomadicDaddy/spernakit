/**
 * The two halves of the username-parity gate that are not assertions: the corpus of names the
 * gate puts to both sides, and the scan for a second copy of the rule.
 *
 * The rule itself lives in `shared/src/usernamePolicy.ts`. Anything in `frontend/src` or
 * `backend/src` that restates it is drift waiting to happen, which is exactly how the Create User
 * dialog came to accept a name the API refused: it kept its own bounds check and never grew the
 * character check to go with it.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** A name the gate puts to the browser rule and to the real API, expecting the same answer. */
interface Candidate {
	/** Why the name is in the corpus, printed when the two sides disagree about it. */
	reason: string;
	/** The exact string a form would submit. */
	username: string;
}

const LONGEST_ACCEPTED = 'u'.repeat(50);

/**
 * Names chosen to sit on both sides of every clause of the rule, plus the two shapes that broke.
 *
 * `bad user` and `bad!` are the reported defect: they passed a bounds-only browser check and were
 * refused by the server. ` ab` is the same defect reached the other way, through a form that
 * validated a trimmed copy and submitted the untrimmed one.
 */
const CANDIDATES: readonly Candidate[] = [
	{ reason: 'ordinary name', username: 'parity_user' },
	{ reason: 'every allowed punctuation mark', username: 'a.b-c_1' },
	{ reason: 'the shortest accepted name', username: 'ab' },
	{ reason: 'the longest accepted name', username: LONGEST_ACCEPTED },
	{ reason: 'one character short', username: 'a' },
	{ reason: 'one character long', username: `${LONGEST_ACCEPTED}u` },
	{ reason: 'nothing typed', username: '' },
	{ reason: 'a space in the middle', username: 'bad user' },
	{ reason: 'a symbol the rule does not list', username: 'bad!' },
	{ reason: 'a leading space', username: ' ab' },
	{ reason: 'a trailing space', username: 'ab ' },
	{ reason: 'an at sign, as in an email address', username: 'user@example' },
	{ reason: 'a letter outside ascii', username: 'usér' },
];

/** Where the rule is allowed to be written down. */
const POLICY_MODULE = 'shared/src/usernamePolicy.ts';

/** The username character class, as it appears in source. */
const CHARACTER_CLASS = 'a-zA-Z0-9_.-';

/** A length compared against one of the shared bounds, rather than deferred to the validator. */
const BOUNDS_COMPARISON = /\.length\s*[<>]=?\s*USERNAME_(?:MAX|MIN)_LENGTH/u;

/** A second copy of the username rule, found in a tree that should be reading the shared one. */
interface RivalRule {
	line: number;
	path: string;
	text: string;
	why: string;
}

/**
 * Find every restatement of the username rule outside the policy module.
 *
 * Two shapes count. A file carrying the character class has its own copy of which characters are
 * allowed. A file comparing a length against `USERNAME_MIN_LENGTH` or `USERNAME_MAX_LENGTH` is
 * building its own verdict out of the shared parts, which is the shape that forgets a clause;
 * passing the bounds to an input's `minLength` or `maxLength` attribute is not that and does not
 * count.
 *
 * @param repoRoot - The template root the paths are relative to.
 * @param files - Repository-relative paths to read.
 * @returns One entry per offending line, in the order the files were given.
 */
function findRivalRules(repoRoot: string, files: readonly string[]): RivalRule[] {
	const found: RivalRule[] = [];
	for (const path of files) {
		if (path === POLICY_MODULE) continue;
		const lines = readFileSync(join(repoRoot, path), 'utf8').split('\n');
		lines.forEach((text, index) => {
			const entry = { line: index + 1, path, text: text.trim() };
			if (text.includes(CHARACTER_CLASS)) {
				found.push({ ...entry, why: 'keeps its own copy of the allowed characters' });
			} else if (BOUNDS_COMPARISON.test(text)) {
				found.push({ ...entry, why: 'builds its own verdict out of the shared bounds' });
			}
		});
	}
	return found;
}

export { CANDIDATES, findRivalRules };
export type { Candidate, RivalRule };
