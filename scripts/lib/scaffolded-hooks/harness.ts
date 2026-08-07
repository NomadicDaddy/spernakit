/**
 * Fixture primitives shared by the scaffolded-hook cases: subprocess capture, byte comparison,
 * a counting assert, and the two hook-text readers the reference checks depend on.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface RunResult {
	exitCode: number;
	output: string;
	stdout: Uint8Array;
}

let checks = 0;

/** Assertions that have passed so far, reported by the entry point as a coverage signal. */
export function assertionCount(): number {
	return checks;
}

export function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
	return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export function write(root: string, relativePath: string, content: string | Uint8Array): void {
	const target = join(root, relativePath);
	mkdirSync(dirname(target), { recursive: true });
	writeFileSync(target, content);
}

export function run(
	command: string[],
	cwd: string,
	stdin?: string,
	env?: Record<string, string>,
): RunResult {
	// windowsHide covers the git and bash spawns below: this fixture runs dozens of them, and
	// without the flag each one flashes a console window across the desktop on Windows.
	const base = {
		cwd,
		stderr: 'pipe',
		stdin: stdin === undefined ? 'ignore' : new TextEncoder().encode(stdin),
		stdout: 'pipe',
		windowsHide: true,
	} as const;
	const result = Bun.spawnSync(
		command,
		// Runs scaffolded git hooks, which shell out to `git` and `bash` and expect the environment a
		// real commit would give them; the caller's `env` layers fixture-specific keys on top.
		env === undefined ? base : { ...base, env: { ...process.env, ...env } }, // allow-env-spread-policy
	);
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
		stdout: result.stdout,
	};
}

/**
 * A hook's executable lines. Both hooks document their own chain in the header — pre-commit names
 * `smoke:qc:fast` three lines above the leak guard it actually runs first — so ordering and
 * reference checks have to read the commands, not the prose about them.
 */
export function commandLines(hookText: string): string {
	return hookText
		.split('\n')
		.filter((line) => !line.trimStart().startsWith('#'))
		.join('\n');
}

/**
 * Every `.sh` a hook chains, as the hook itself spells it. Covers both call shapes in use —
 * `bash .githooks/leak-guard.sh` from pre-commit and `bash "$hooks_dir/screenshot-guard.sh"` from
 * pre-push — so the set is whatever the hooks actually run, not whatever this suite knows about.
 */
export function referencedGuards(hookText: string): string[] {
	const pattern = /(?:\.githooks|\$\{?hooks_dir\}?)\/([A-Za-z0-9._-]+\.sh)/g;
	return [...new Set([...hookText.matchAll(pattern)].map((match) => match[1] as string))].sort(
		(left, right) => left.localeCompare(right),
	);
}
