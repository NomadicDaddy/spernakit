/**
 * The step-up surfaces and the scan that keeps them from drifting back.
 *
 * A step-up surface is a route that asks an already signed-in user for their current password
 * before it will do something sensitive. There are three: changing the password, starting an email
 * change, and beginning MFA setup. They are the whole population, so the gate can probe each one
 * rather than sample.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** One route that re-checks the current password, and how to reach it. */
interface StepUpRoute {
	/** A body that is valid in every respect except the current password. */
	body: Record<string, string>;
	method: 'POST' | 'PUT';
	path: string;
	/** How the reader would describe reaching this route. */
	surface: string;
}

/** The password every probe sends: well-formed, and not any seeded account's. */
const WRONG_PASSWORD = 'Definitely-Not-The-One-1!';

const STEP_UP_ROUTES: readonly StepUpRoute[] = [
	{
		body: { currentPassword: WRONG_PASSWORD, newPassword: 'Step-Up-Probe-1!' },
		method: 'PUT',
		path: '/api/v1/users/me/password',
		surface: 'changing your password from the Security tab',
	},
	{
		body: { currentPassword: WRONG_PASSWORD, newEmail: 'step-up-probe@example.com' },
		method: 'POST',
		path: '/api/v1/users/me/email-change',
		surface: 'starting an email change from the Security tab',
	},
	{
		body: { currentPassword: WRONG_PASSWORD },
		method: 'POST',
		path: '/api/v1/auth/mfa/setup',
		surface: 'beginning MFA setup',
	},
];

/** A route file that answers a step-up rejection with the sign-in code. */
interface SignInCodeUse {
	line: number;
	path: string;
	text: string;
}

/** The code a route may use only when it is deciding whether to let someone in at all. */
const SIGN_IN_CODE = 'AUTH_INVALID_CREDENTIALS';

/** The code a step-up rejection carries instead. */
const STEP_UP_CODE = 'AUTH_CURRENT_PASSWORD_INVALID';

/**
 * Route files that read a current password out of a request body and then answer with the sign-in
 * code.
 *
 * The two are only a problem together. A file that reads a current password is a step-up surface,
 * and the sign-in code carries the sign-in sentence to the browser, which talks about a username
 * this form never asked for. A file that uses the sign-in code without reading a current password
 * is the login route doing its own job, which is exactly what the code is for.
 *
 * @param repoRoot - Directory the paths are relative to.
 * @param files - Repository-relative paths of the route sources to read.
 * @returns One entry per offending line, in the order the files were given.
 */
function findSignInCodeInStepUp(repoRoot: string, files: readonly string[]): SignInCodeUse[] {
	const found: SignInCodeUse[] = [];
	for (const path of files) {
		const source = readFileSync(join(repoRoot, path), 'utf8');
		if (!/\bcurrentPassword\b/u.test(source)) continue;
		const lines = source.split('\n');
		for (const [index, text] of lines.entries()) {
			if (!text.includes(SIGN_IN_CODE)) continue;
			found.push({ line: index + 1, path, text: text.trim() });
		}
	}
	return found;
}

export { findSignInCodeInStepUp, SIGN_IN_CODE, STEP_UP_CODE, STEP_UP_ROUTES, WRONG_PASSWORD };
export type { SignInCodeUse, StepUpRoute };
