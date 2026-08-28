#!/usr/bin/env bun
/**
 * Regression coverage for application errors reaching logs/<name>.error.log.
 *
 * The defect this gate was written for: pino sent every level to stdout, and the file named
 * error.log is nothing but the spawned server's stderr stream, opened by
 * scripts/lib/process/spawn-background.ts for `bun run start` and written from the child's stderr
 * by scripts/dev-with-logs.ts for `bun run dev`. So the error log held crashes and interpreter
 * warnings and never a single application error, and every tool that read it to decide whether a
 * start-up was clean was reading a file that could not hold the evidence.
 *
 * The gate runs a probe process through the same wiring and asserts, per configuration mode:
 *
 *  1. An application error entry appears in the error log.
 *  2. It carries the same redaction as the main log: the secret-shaped field is censored and the
 *     plaintext appears nowhere in the file.
 *  3. The main log still holds every level, so errors are copied rather than moved.
 *  4. Process-level stderr still lands in the error log.
 *  5. The same holds whether the process was spawned the way start.ts spawns one (stderr straight
 *     to the file descriptor) or the way dev-with-logs.ts does (stderr piped and written on).
 *
 * The probe is spawned through the real spawnBackground for the descriptor cases, so a change to
 * that wiring fails here rather than passing on a re-implementation of it.
 */
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { spawnBackground } from './lib/process/spawn-background.ts';

interface Case {
	/** Configuration mode the probe builds its logger for. */
	mode: 'dev' | 'prod-file' | 'prod';
	/** How the child's streams reach the files: as descriptors, or piped and written on. */
	via: 'fd' | 'pipe';
}

const CASES: Case[] = [
	{ mode: 'dev', via: 'fd' },
	{ mode: 'dev', via: 'pipe' },
	{ mode: 'prod', via: 'fd' },
	{ mode: 'prod-file', via: 'fd' },
];

const PROBE = 'scripts/lib/process/error-log-probe.ts';
const ROOT = join(import.meta.dir, '..');
const WAIT_MS = 20_000;
const POLL_MS = 100;
/** The escape byte, built rather than typed so this file stays plain ASCII. */
const ESC = String.fromCharCode(27);

const failures: string[] = [];
let checks = 0;

function assert(condition: boolean, message: string): void {
	if (condition) {
		checks++;
		return;
	}
	failures.push(message);
}

function read(path: string): string {
	return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** dev-with-logs.ts strips ANSI before writing a captured stream to its file; so does this. */
function stripAnsi(text: string): string {
	return text.replaceAll(new RegExp(`${ESC}\\[[0-9;]*m`, 'g'), '');
}

async function waitFor(check: () => boolean): Promise<boolean> {
	const deadline = Date.now() + WAIT_MS;
	while (Date.now() < deadline) {
		if (check()) return true;
		await Bun.sleep(POLL_MS);
	}
	return check();
}

/** Spawn the probe the way start.ts spawns a server: the log files are the child's descriptors. */
async function runViaDescriptors(logsDir: string, name: string, args: string[]): Promise<void> {
	const pid = spawnBackground(logsDir, name, 'bun', [PROBE, ...args], ROOT);
	if (pid === null) throw new Error(`spawnBackground refused to start the ${name} probe`);

	const errorLog = join(logsDir, `${name}.error.log`);
	const marker = args[1] ?? '';
	await waitFor(() => read(errorLog).includes(`${marker} raw stderr line`));
	// The raw line is written last but through a different stream than the logger's transport
	// worker, so give the worker the rest of its flush window before reading.
	await Bun.sleep(1500);
}

/** Spawn the probe the way dev-with-logs.ts does: streams piped, stripped, and written on. */
async function runViaPipes(logsDir: string, name: string, args: string[]): Promise<void> {
	const child = Bun.spawn(['bun', PROBE, ...args], {
		cwd: ROOT,
		stderr: 'pipe',
		stdout: 'pipe',
	});

	const [out, err] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	await child.exited;

	await Bun.write(join(logsDir, `${name}.log`), stripAnsi(out));
	await Bun.write(join(logsDir, `${name}.error.log`), stripAnsi(err));
}

function assertCase(testCase: Case, logsDir: string, name: string, marker: string): void {
	const label = `${testCase.mode} via ${testCase.via}`;
	const mainLog = read(join(logsDir, `${name}.log`));
	const errorLog = read(join(logsDir, `${name}.error.log`));

	assert(
		errorLog.includes(`${marker} error entry`),
		`${label}: an application error must appear in the error log; it held ${JSON.stringify(errorLog.slice(0, 400))}`,
	);
	assert(
		errorLog.includes('Redacted') && !errorLog.includes(`${marker}-PLAINTEXT`),
		`${label}: the error log must carry the same redaction as the main log, censoring the secret-shaped field`,
	);
	assert(
		mainLog.includes(`${marker} error entry`) && mainLog.includes(`${marker} info entry`),
		`${label}: the main log must still hold every level, so errors are copied rather than moved`,
	);
	assert(
		!errorLog.includes(`${marker} info entry`),
		`${label}: only error and above belong in the error log; the info entry reached it`,
	);
	assert(
		errorLog.includes(`${marker} raw stderr line`),
		`${label}: process-level stderr must still land in the error log`,
	);
	assert(
		!errorLog.includes(ESC),
		`${label}: the error log is read back out of a file, so it must not carry terminal escapes`,
	);
}

function assertRolledFile(rollPath: string, marker: string): void {
	const dir = join(rollPath, '..');
	const base = 'probe-roll';
	const rolled = existsSync(dir) ? readdirSync(dir).filter((f) => f.startsWith(base)) : [];
	assert(
		rolled.length > 0,
		`prod-file: file logging must still produce a rotated file; ${dir} held ${JSON.stringify(readdirSync(dir))}`,
	);
	const contents = rolled.map((f) => read(join(dir, f))).join('');
	assert(
		contents.includes(`${marker} error entry`) && contents.includes(`${marker} info entry`),
		'prod-file: the rotated file must still receive every level, unchanged by the error target',
	);
}

const workRoot = mkdtempSync(join(tmpdir(), 'spernakit-error-log-'));

try {
	for (const testCase of CASES) {
		const name = `probe-${testCase.mode}-${testCase.via}`;
		const marker = name.toUpperCase();
		const logsDir = join(workRoot, name);
		mkdirSync(logsDir, { recursive: true });

		const rollPath = join(logsDir, 'probe-roll.log');
		const args = [testCase.mode, marker, rollPath];

		if (testCase.via === 'fd') await runViaDescriptors(logsDir, name, args);
		else await runViaPipes(logsDir, name, args);

		assertCase(testCase, logsDir, name, marker);
		if (testCase.mode === 'prod-file') assertRolledFile(rollPath, marker);
	}
} finally {
	rmSync(workRoot, { force: true, recursive: true });
}

if (failures.length === 0) {
	console.log(
		`[OK] Error-log wiring checks passed (${String(checks)} assertions across ${String(CASES.length)} modes).`,
	);
} else {
	console.error('[FAIL] Error-log wiring regression:');
	for (const failure of failures) console.error(' -', failure);
	process.exit(1);
}
