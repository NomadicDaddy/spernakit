import { formatCredentialsForDisplay } from '../utils/auth/passwordGenerator.ts';

/**
 * Credential plaintext never goes through a logger (log files are the exact place it must not
 * live - demo-account-seeding criterion 16). The display is a TTY-gated direct stdout write, the documented
 * first-run console channel; a non-interactive environment gets nothing on stdout.
 */
export function printSeedCredentialsToConsole(
	credentials: { password: string; username: string }[],
): void {
	if (process.stdout.isTTY === true) {
		process.stdout.write(formatCredentialsForDisplay(credentials));
	}
}

/**
 * The production seed's save-credentials notice. The mandatory-password-change sentence appears
 * only when the auth-settings "Require Password Change on First Login" toggle is on, because that
 * toggle is what seedUsersIfEmpty uses to set requiresPasswordChange on the seeded accounts.
 *
 * @param requirePasswordChange - The effective auth-settings toggle the seeded accounts follow.
 * @returns The notice to log after the production credentials are displayed.
 */
export function productionSeedNotice(requirePasswordChange: boolean): string {
	const save =
		'IMPORTANT: Save the displayed production credentials now - they cannot be retrieved later.';
	return requirePasswordChange
		? `${save} All accounts require password change on first login.`
		: save;
}
