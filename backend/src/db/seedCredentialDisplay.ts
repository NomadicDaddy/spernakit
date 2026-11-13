import { formatCredentialsForDisplay } from '../utils/auth/passwordGenerator.ts';

/**
 * Credential plaintext never goes through a logger (log files are the exact place it must not
 * live - remediation-20261113). The display is a TTY-gated direct stdout write, the documented
 * first-run console channel; a non-interactive environment gets nothing on stdout.
 */
export function printSeedCredentialsToConsole(
	credentials: { password: string; username: string }[],
): void {
	if (process.stdout.isTTY === true) {
		process.stdout.write(formatCredentialsForDisplay(credentials));
	}
}
