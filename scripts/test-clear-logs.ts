#!/usr/bin/env bun
/**
 * Regression coverage for clear-logs only removing the logs/ files this repository writes.
 *
 * The fixture stands up a logs/ directory holding three kinds of file: the runtime's own output,
 * the step transcripts scripts/smoke.json redirects into logs/, and files that belong to whoever
 * put them there. The script must remove the first two and leave the third, because smoke:reset and
 * smoke:screenshots run it while an operator's gate transcript may be open in the same directory.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface RunResult {
	exitCode: number;
	output: string;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

function run(): RunResult {
	const result = Bun.spawnSync(['bun', 'scripts/clear-logs.ts'], {
		cwd: fixtureRoot,
		stderr: 'pipe',
		stdout: 'pipe',
	});
	return {
		exitCode: result.exitCode,
		output: `${result.stdout.toString()}${result.stderr.toString()}`,
	};
}

function seed(files: string[]): void {
	rmSync(logsDir, { force: true, recursive: true });
	mkdirSync(logsDir, { recursive: true });
	for (const file of files) writeFileSync(join(logsDir, file), `${file}\n`, 'utf8');
}

function writeSmokeConfig(body: string): void {
	writeFileSync(join(fixtureRoot, 'scripts', 'smoke.json'), body, 'utf8');
}

/** The runtime stems dev-with-logs.ts, start.ts and stop.ts derive their filenames from. */
const RUNTIME_FILES = [
	'backend.log',
	'backend.error.log',
	'backend.pid',
	'frontend.log',
	'frontend.error.log',
	'frontend.pid',
	'backend-2026-08-26T17-40-00.log',
	'frontend.log.1',
];

/** Named by a logFile in the fixture runbook below, the way crawltest steps are in the real one. */
const DECLARED_FILES = ['crawltest.log', 'crawltest-screenshots.log'];

/**
 * Files nothing in this repository writes. `supertest.log` is the case that motivated the
 * narrowing: an operator redirects a long gate there, and on Windows the unlink succeeds while the
 * writer keeps its handle, so the transcript goes on being written to a file nobody can open.
 */
const FOREIGN_FILES = [
	'supertest.log',
	'dance-d1.log',
	'backend.log.txt',
	'crawltest.json',
	'notes.md',
];

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'clear-logs-'));
const logsDir = join(fixtureRoot, 'logs');

try {
	mkdirSync(join(fixtureRoot, 'scripts'), { recursive: true });
	copyFileSync(
		join(repoRoot, 'scripts', 'clear-logs.ts'),
		join(fixtureRoot, 'scripts', 'clear-logs.ts'),
	);
	writeSmokeConfig(
		`${JSON.stringify(
			{
				modes: {
					screenshots: {
						steps: [
							{ command: 'bun scripts/clear-logs.ts' },
							{
								command: 'bun run crawltest',
								logFile: 'logs/crawltest-screenshots.log',
							},
						],
					},
					standard: {
						steps: [{ command: 'bun run crawltest', logFile: 'logs/crawltest.log' }],
					},
				},
			},
			null,
			'\t',
		)}\n`,
	);

	seed([...RUNTIME_FILES, ...DECLARED_FILES, ...FOREIGN_FILES, '.gitkeep']);
	const mixed = run();
	assert(mixed.exitCode === 0, `Clearing a mixed logs/ must succeed:\n${mixed.output}`);
	for (const file of [...RUNTIME_FILES, ...DECLARED_FILES]) {
		assert(
			!existsSync(join(logsDir, file)),
			`${file} is written by this repository and must be cleared:\n${mixed.output}`,
		);
	}
	for (const file of FOREIGN_FILES) {
		assert(
			existsSync(join(logsDir, file)),
			`${file} is not written by this repository and must survive:\n${mixed.output}`,
		);
	}
	assert(
		existsSync(join(logsDir, '.gitkeep')),
		`.gitkeep keeps logs/ tracked and must survive:\n${mixed.output}`,
	);
	assert(
		mixed.output.includes(
			`Cleared ${RUNTIME_FILES.length + DECLARED_FILES.length} log/pid files`,
		),
		`Output must count what it removed:\n${mixed.output}`,
	);
	for (const file of FOREIGN_FILES) {
		assert(
			mixed.output.includes(file),
			`Output must name ${file} among the files it kept:\n${mixed.output}`,
		);
	}

	seed([...RUNTIME_FILES, ...DECLARED_FILES, 'supertest.log']);
	writeSmokeConfig('{ this is not json\n');
	const unparseable = run();
	assert(
		unparseable.exitCode === 0,
		`An unparseable runbook is the smoke runner's failure to report, not this script's:\n${unparseable.output}`,
	);
	for (const file of RUNTIME_FILES) {
		assert(
			!existsSync(join(logsDir, file)),
			`${file} must still be cleared when the runbook cannot be read:\n${unparseable.output}`,
		);
	}
	for (const file of DECLARED_FILES) {
		assert(
			existsSync(join(logsDir, file)),
			`${file} must be kept when the runbook that declares it cannot be read:\n${unparseable.output}`,
		);
	}
	assert(
		existsSync(join(logsDir, 'supertest.log')),
		`A foreign file must survive an unparseable runbook:\n${unparseable.output}`,
	);

	rmSync(logsDir, { force: true, recursive: true });
	const absent = run();
	assert(absent.exitCode === 0, `A missing logs/ must not fail the step:\n${absent.output}`);
	assert(
		absent.output.includes('No logs/ directory found'),
		`A missing logs/ must say so:\n${absent.output}`,
	);

	console.log(`Clear-logs ownership test passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
