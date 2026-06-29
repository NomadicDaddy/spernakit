/**
 * Shared password strength validation.
 * Used by registration, password reset, and password change endpoints.
 */

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

interface PasswordValidationOptions {
	requireSpecialCharacter?: boolean;
}

/**
 * Validate password strength beyond just length.
 * Checks for minimum length, maximum length, lowercase, uppercase, digit,
 * and optionally special character requirements.
 *
 * @param password - The password to validate
 * @param options - Optional validation configuration
 * @returns An error message if the password is weak, or null if acceptable
 */
function validatePasswordStrength(
	password: string,
	options?: PasswordValidationOptions
): null | string {
	if (password.length < PASSWORD_MIN_LENGTH) {
		return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`;
	}
	if (password.length > PASSWORD_MAX_LENGTH) {
		return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`;
	}
	if (!/[a-z]/.test(password)) {
		return 'Password must contain at least one lowercase letter';
	}
	if (!/[A-Z]/.test(password)) {
		return 'Password must contain at least one uppercase letter';
	}
	if (!/\d/.test(password)) {
		return 'Password must contain at least one number';
	}
	if (
		options?.requireSpecialCharacter &&
		!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(password)
	) {
		return 'Password must contain at least one special character';
	}
	return null;
}

export { validatePasswordStrength };
