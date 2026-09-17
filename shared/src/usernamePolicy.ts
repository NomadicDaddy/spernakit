/**
 * Shared username policy — the one rule the API schemas and the browser forms both read.
 *
 * The API has always accepted letters, digits, underscore, dot and hyphen, between 2 and 50
 * characters. The browser used to restate that rule once per form and get it wrong differently
 * each time: the Create User dialog checked only the lower bound, the registration form checked
 * both bounds and kept its own copy of the character pattern, and the profile page kept a third
 * copy. A name like `bad user!` passed the create dialog, went to the server, and came back
 * refused, which is the disagreement this module removes.
 *
 * `USERNAME_PATTERN` is a string because the API's TypeBox schemas take `pattern` as one. The
 * compiled form is kept beside it so callers do not each build their own.
 */

/** Minimum username length. */
const USERNAME_MIN_LENGTH = 2;

/** Maximum username length. */
const USERNAME_MAX_LENGTH = 50;

/**
 * Allowed characters: letters, digits, underscore, dot, hyphen.
 *
 * Published as the class on its own as well as inside the anchored pattern, because the OAuth
 * username generator needs the negated form to sanitize a provider's display name and should not
 * write out a second copy of the characters to get it.
 */
const USERNAME_CHARACTER_CLASS = 'a-zA-Z0-9_.-';

const USERNAME_PATTERN = `^[${USERNAME_CHARACTER_CLASS}]+$`;

const USERNAME_PATTERN_REGEX = new RegExp(USERNAME_PATTERN);

/** The message shown for a username carrying a character the API will not take. */
const USERNAME_CHARACTERS_MESSAGE =
	'Only letters, numbers, underscores, dots, and hyphens are allowed';

/**
 * Validate a username against the same rule the API enforces.
 *
 * Pass the exact string that will be sent. A form that validates a trimmed value and then submits
 * the untrimmed one is back to disagreeing with the server, because a leading space fails the
 * character rule.
 *
 * @param username - The username to check.
 * @returns The first failing rule's message, or null when the API would accept it.
 */
function validateUsername(username: string): null | string {
	if (username.length === 0) return 'Username is required';
	if (username.length < USERNAME_MIN_LENGTH) {
		return `Username must be at least ${USERNAME_MIN_LENGTH} characters`;
	}
	if (username.length > USERNAME_MAX_LENGTH) {
		return `Username must be at most ${USERNAME_MAX_LENGTH} characters`;
	}
	if (!USERNAME_PATTERN_REGEX.test(username)) return USERNAME_CHARACTERS_MESSAGE;
	return null;
}

export {
	USERNAME_CHARACTER_CLASS,
	USERNAME_CHARACTERS_MESSAGE,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	USERNAME_PATTERN,
	validateUsername,
};
