import { useQuery } from '@tanstack/react-query';

import { getRegistrationStatus } from '@/api/auth';

/** Effective public password-policy flags the client validates against. */
interface PasswordPolicy {
	/** Whether a special character is required, read from the live server setting. */
	requireSpecialCharacter: boolean;
}

/**
 * Read the effective password policy from the public `/auth/registration-status`
 * endpoint so password forms validate against the runtime server policy rather than
 * the hardcoded backend default.
 *
 * Shares the `['registration-status']` query cache with the registration page. While
 * loading or when the endpoint is unavailable, falls back to the stricter backend
 * default (`requireSpecialCharacter: true`) so the client never accepts a password the
 * server would reject.
 */
function usePasswordPolicy(): PasswordPolicy {
	const { data } = useQuery({
		queryFn: getRegistrationStatus,
		queryKey: ['registration-status'],
		throwOnError: false,
	});

	return { requireSpecialCharacter: data?.requireSpecialCharacter ?? true };
}

export { usePasswordPolicy };
export type { PasswordPolicy };
