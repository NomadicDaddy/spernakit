/**
 * Shared password complexity policy — single source of truth for frontend forms.
 *
 * Mirrors `backend/src/utils/auth/passwordValidation.ts` exactly (length bounds,
 * lowercase, uppercase, digit, and the configurable special-character rule).
 * The backend can be switched to consume this module later.
 */

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

/** Special characters accepted by the backend's special-character rule. */
const PASSWORD_SPECIAL_CHARACTER_PATTERN = /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/;

type PasswordRuleId = 'digit' | 'lowercase' | 'maxLength' | 'minLength' | 'special' | 'uppercase';

/** Per-rule metadata for rendering requirement checklists and validating input. */
interface PasswordRule {
	/** Stable rule identifier. */
	id: PasswordRuleId;
	/** Error message shown when the rule fails — matches backend wording. */
	message: string;
	/** True when the rule only applies while `requireSpecialCharacter` is enabled. */
	optional?: boolean;
	/** Returns true when the password satisfies the rule. */
	test: (password: string) => boolean;
}

interface PasswordValidationOptions {
	/** Whether a special character is required. Defaults to true (backend default). */
	requireSpecialCharacter?: boolean;
}

/** Ordered password rules — evaluation order matches the backend validator. */
const PASSWORD_RULES: readonly PasswordRule[] = [
	{
		id: 'minLength',
		message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
		test: (password) => password.length >= PASSWORD_MIN_LENGTH,
	},
	{
		id: 'maxLength',
		message: `Password must be at most ${PASSWORD_MAX_LENGTH} characters`,
		test: (password) => password.length <= PASSWORD_MAX_LENGTH,
	},
	{
		id: 'lowercase',
		message: 'Password must contain at least one lowercase letter',
		test: (password) => /[a-z]/.test(password),
	},
	{
		id: 'uppercase',
		message: 'Password must contain at least one uppercase letter',
		test: (password) => /[A-Z]/.test(password),
	},
	{
		id: 'digit',
		message: 'Password must contain at least one number',
		test: (password) => /\d/.test(password),
	},
	{
		id: 'special',
		message: 'Password must contain at least one special character',
		optional: true,
		test: (password) => PASSWORD_SPECIAL_CHARACTER_PATTERN.test(password),
	},
];

/**
 * Validate password complexity, mirroring the backend's rules.
 *
 * @param password - The password to validate
 * @param options - Optional validation configuration
 * @returns The first failing rule's error message, or null if acceptable
 */
function validatePasswordComplexity(
	password: string,
	options?: PasswordValidationOptions
): null | string {
	const requireSpecialCharacter = options?.requireSpecialCharacter ?? true;
	for (const rule of PASSWORD_RULES) {
		if (rule.optional && !requireSpecialCharacter) continue;
		if (!rule.test(password)) return rule.message;
	}
	return null;
}

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_RULES, validatePasswordComplexity };
export type { PasswordRule, PasswordRuleId, PasswordValidationOptions };
