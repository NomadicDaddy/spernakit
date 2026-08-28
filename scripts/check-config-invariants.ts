#!/usr/bin/env bun
/**
 * Config Invariants Guard
 *
 * Enforces: the four config invariants enumerated below -- rate limiting on by default, no
 * loopback address in the shipped example's audit whitelist, an app version distinct from its
 * `spernakit_version`, and no bare `bash` in a package script. No assertion ID: the catalog
 * states none of the four.
 *
 * Enforces config invariants that must remain stable:
 *
 * 1. `backend/src/config/defaults.json` — rateLimit.enabled must be true.
 *    Disabling it would remove the default request-rate protection.
 *
 * 2. `config/example.json` — audit.ipWhitelist must contain no loopback address.
 *    A whitelisted address is dropped from the audit log outright, and the example is the
 *    only tracked configuration a fresh clone has, so shipping 127.0.0.1 and ::1 in it turned
 *    the audit log off for every request that reached a new application locally. The plugin
 *    says so itself at backend/src/plugins/audit.ts: local SYSOP traffic is the primary audit
 *    signal and must never be auto-excluded. The whitelist stays available to an operator who
 *    lists an address deliberately; what is removed is the default that nobody chose.
 *
 * 3. `package.json` — in derived apps, `version` must not equal
 *    `spernakit_version`. Application and template versions have separate
 *    meanings and must not be synchronized by template upgrades.
 *
 * 4. `package.json` — no script may invoke a bare `bash`. On Windows,
 *    C:\Windows\System32\bash.exe is the WSL launcher and shadows Git's bash
 *    for every process whose PATH does not prepend Git's usr/bin, which is
 *    every PowerShell and cmd session. A bare `bash` therefore passes from Git
 *    Bash and fails from PowerShell on the same machine — the failure that
 *    broke `bun install` and smoke:qc with an execvpe(/bin/bash) relay error
 *    naming neither the script nor the shell it wanted. Shell scripts are
 *    invoked through scripts/run-bash.ts, which resolves Git's own bash.
 *
 * Scope is intentionally narrow. Expand only with a documented justification.
 *
 * Usage:
 *   bun scripts/check-config-invariants.ts
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { exit } from 'node:process';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const defaultsPath = join(projectRoot, 'backend/src/config/defaults.json');
const examplePath = join(projectRoot, 'config/example.json');
const packageJsonPath = join(projectRoot, 'package.json');

interface Invariant {
	actual: unknown;
	expected: unknown;
	message: string;
	name: string;
}

function getNestedValue(obj: unknown, path: string): unknown {
	const parts = path.split('.');
	let current: unknown = obj;
	for (const part of parts) {
		if (current === null || current === undefined || typeof current !== 'object')
			return undefined;
		current = (current as Record<string, unknown>)[part];
	}
	return current;
}

function checkDefaultsInvariants(): string[] {
	const raw = readFileSync(defaultsPath, 'utf-8');
	const defaults = JSON.parse(raw) as Record<string, unknown>;

	const invariants: Invariant[] = [
		{
			actual: getNestedValue(defaults, 'rateLimit.enabled'),
			expected: true,
			message:
				'defaults.json must ship with rateLimit.enabled=true. If you disabled this ' +
				'locally to work around 429s during development, revert before committing. ' +
				'See docs/template/adr/adr-009-rate-limit-policy.md for the policy.',
			name: 'rateLimit.enabled',
		},
	];

	const failures = invariants.filter((i) => i.actual !== i.expected);
	return failures.map(
		(f) =>
			`defaults.json ${f.name}: expected ${String(f.expected)}, got ${String(f.actual)}\n    ${f.message}`,
	);
}

/**
 * Addresses that name the machine the application is running on.
 *
 * The IPv4 loopback is a whole /8, and an IPv6 stack reports a v4 loopback peer through the
 * v4-mapped form, so matching the two literals the example happened to carry would leave the
 * same hole open under a different spelling. `localhost` is here because a proxy that forwards
 * the name rather than the address would otherwise slip through.
 *
 * @param address - A single entry from the whitelist.
 * @returns Whether that entry refers to the local machine.
 */
function isLoopbackAddress(address: string): boolean {
	const value = address.trim().toLowerCase();
	if (value === '::1' || value === 'localhost') return true;
	if (value.startsWith('::ffff:')) return isLoopbackAddress(value.slice('::ffff:'.length));
	return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value);
}

/**
 * Check the shipped example configuration for a whitelist that would silence the audit log.
 *
 * @returns One failure message per loopback address found, empty when the example is clean.
 */
function checkExampleConfigInvariants(): string[] {
	const example = JSON.parse(readFileSync(examplePath, 'utf-8')) as Record<string, unknown>;
	const whitelist = getNestedValue(example, 'audit.ipWhitelist');
	if (!Array.isArray(whitelist)) {
		return [
			'config/example.json audit.ipWhitelist: expected an array, got ' +
				`${String(whitelist)}. The field is required by config/config-schema.json.`,
		];
	}

	return whitelist
		.filter((entry): entry is string => typeof entry === 'string')
		.filter(isLoopbackAddress)
		.map(
			(entry) =>
				`config/example.json audit.ipWhitelist contains the loopback address "${entry}".\n    ` +
				'A whitelisted address is dropped from the audit log, and this file is the only ' +
				'configuration a fresh clone has, so shipping it here starts a new application with ' +
				'no audit trail for anything that reaches it locally. Remove the entry. An operator ' +
				'who wants local traffic excluded can still list it in their own config/<slug>.json.',
		);
}

function checkPackageJsonInvariants(): string[] {
	const raw = readFileSync(packageJsonPath, 'utf-8');
	const pkg = JSON.parse(raw) as Record<string, unknown>;

	// Only derived apps have spernakit_version — skip on the template itself.
	if (!('spernakit_version' in pkg)) return [];

	const failures: string[] = [];
	const version = pkg['version'];
	const spernakitVersion = pkg['spernakit_version'];

	if (version === spernakitVersion) {
		failures.push(
			`package.json version: "${String(version)}" matches spernakit_version ("${String(spernakitVersion)}"). ` +
				"This is the contamination signature from template-upgrade: the template's own version " +
				"was copied into the app's version field. Restore the app's real version (check git " +
				'history or config/*.json) and keep spernakit_version as the tracker.',
		);
	}

	return failures;
}

function checkScriptShellInvariants(): string[] {
	const raw = readFileSync(packageJsonPath, 'utf-8');
	const pkg = JSON.parse(raw) as Record<string, unknown>;
	const scripts = (pkg['scripts'] ?? {}) as Record<string, string>;

	return Object.entries(scripts)
		.filter(([, command]) => /(?:^|\s|\()bash\s/.test(command))
		.map(
			([name, command]) =>
				`package.json scripts.${name} invokes a bare "bash": ${command}\n    ` +
				'On Windows that resolves to the System32 WSL launcher, not Git Bash, so the ' +
				'script passes from Git Bash and fails from PowerShell on the same machine. ' +
				'Invoke it as `bun ./scripts/run-bash.ts <script.sh>` instead.',
		);
}

export function runConfigInvariants(): number {
	const failures: string[] = [
		...checkDefaultsInvariants(),
		...checkExampleConfigInvariants(),
		...checkPackageJsonInvariants(),
		...checkScriptShellInvariants(),
	];

	if (failures.length === 0) {
		console.log('[OK] Config invariants passed.');
		return 0;
	}

	console.error('[FAIL] Config invariants violated:');
	for (const failure of failures) {
		console.error(`  - ${failure}`);
	}
	return 1;
}

if (import.meta.main) exit(runConfigInvariants());
