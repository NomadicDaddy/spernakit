import type { PasswordValidationOptions } from 'spernakit-shared';

import { PASSWORD_MIN_LENGTH, validatePasswordComplexity } from 'spernakit-shared';

/** Minimum username length — must match backend TypeBox schema */
const USERNAME_MIN_LENGTH = 2;

/** Maximum username length — must match backend TypeBox schema */
const USERNAME_MAX_LENGTH = 50;

/** Truncation threshold for data viewer cell values */
const CELL_TRUNCATION_LENGTH = 80;

/** Simple email format validation matching user@domain.tld pattern. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate that a string looks like a valid email address.
 * Uses a simple but effective pattern that checks for:
 * - No spaces or @ signs before the @ symbol
 * - An @ symbol separating local and domain parts
 * - A dot in the domain part
 *
 * @param email - The email address to validate
 * @returns true if email format is valid
 */
function isValidEmail(email: string): boolean {
	return EMAIL_PATTERN.test(email);
}

/**
 * Validate password and confirmation match, and meet the shared complexity policy
 * (length bounds, lowercase, uppercase, digit, special character — mirrors backend).
 *
 * Pass the live `requireSpecialCharacter` flag (from the public registration-status
 * endpoint via {@link usePasswordPolicy}) so client validation tracks the runtime
 * server policy. When omitted, the shared validator falls back to its backend-default.
 * @returns Error message string on failure, null on success.
 */
function validatePasswordMatch(
	password: string,
	confirmPassword: string,
	options?: PasswordValidationOptions
): null | string {
	if (password !== confirmPassword) {
		return 'Passwords do not match';
	}
	return validatePasswordComplexity(password, options);
}

export {
	CELL_TRUNCATION_LENGTH,
	isValidEmail,
	PASSWORD_MIN_LENGTH,
	USERNAME_MAX_LENGTH,
	USERNAME_MIN_LENGTH,
	validatePasswordComplexity,
	validatePasswordMatch,
};
