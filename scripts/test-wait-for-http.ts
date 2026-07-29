#!/usr/bin/env bun
/**
 * Regression coverage for Docker readiness diagnostics.
 *
 * Drives the shipped wait-for-http CLI against an isolated Docker CLI fixture so the test remains
 * deterministic without requiring a host Docker daemon. The fixture models a container entrypoint
 * that writes a known startup error and exits non-zero, plus a running crash-loop fixture that
 * reaches the readiness timeout.
 */
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';

interface CommandResult {
	code: number;
	elapsedMs: number;
	output: string;
}

interface SmokeConfig {
	modes: Record<string, { steps: { command: string }[] }>;
}

let checks = 0;

function assert(condition: boolean, message: string): void {
	if (!condition) throw new Error(message);
	checks++;
}

async function runWaitForHttp(fixtureBin: string, args: string[]): Promise<CommandResult> {
	const path = process.env['PATH'] ?? '';
	const startedAt = performance.now();
	const proc = Bun.spawn(['bun', 'scripts/wait-for-http.ts', ...args], {
		cwd: join(import.meta.dir, '..'),
		env: { ...process.env, PATH: `${fixtureBin}${delimiter}${path}` },
		stderr: 'pipe',
		stdout: 'pipe',
	});
	const [code, stderr, stdout] = await Promise.all([
		proc.exited,
		new Response(proc.stderr).text(),
		new Response(proc.stdout).text(),
	]);
	return {
		code,
		elapsedMs: performance.now() - startedAt,
		output: `${stdout}${stderr}`,
	};
}

const repoRoot = join(import.meta.dir, '..');
const fixtureParent = join(repoRoot, 'tmp');
mkdirSync(fixtureParent, { recursive: true });
const fixtureRoot = mkdtempSync(join(fixtureParent, 'wait-for-http-'));
const fixtureBin = join(fixtureRoot, 'bin');
const callsPath = join(fixtureRoot, 'docker-calls.txt');
mkdirSync(fixtureBin, { recursive: true });

const dockerFixture = `#!/usr/bin/env bun
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';

const [command, ...args] = process.argv.slice(2);
appendFileSync(join(import.meta.dir, '..', 'docker-calls.txt'), [command, ...args].join(' ') + '\\n');
const container = args.at(-1);

if (command === 'inspect') {
	if (container === 'fatal-fixture') console.log('false 23 0 false');
	else if (container === 'timeout-fixture') console.log('false 0 2 true');
	else process.exit(1);
} else if (command === 'logs') {
	if (container === 'fatal-fixture') console.error('KNOWN_STARTUP_ERROR: fixture refused startup');
	else if (container === 'timeout-fixture') console.log('fixture is still crash-looping');
	else process.exit(1);
} else {
	process.exit(1);
}
`;
writeFileSync(join(fixtureBin, 'docker-fixture.ts'), dockerFixture);

if (process.platform === 'win32') {
	writeFileSync(
		join(fixtureBin, 'docker.cmd'),
		'@echo off\r\nbun "%~dp0docker-fixture.ts" %*\r\n',
	);
} else {
	const dockerPath = join(fixtureBin, 'docker');
	writeFileSync(
		dockerPath,
		'#!/usr/bin/env sh\nexec bun "$(dirname "$0")/docker-fixture.ts" "$@"\n',
	);
	chmodSync(dockerPath, 0o755);
}

try {
	const fatal = await runWaitForHttp(fixtureBin, [
		'--url',
		'http://127.0.0.1:1/health',
		'--intervalMs',
		'10',
		'--container',
		'fatal-fixture',
	]);
	assert(fatal.code !== 0, 'A stopped container with a non-zero exit must fail readiness');
	assert(
		fatal.output.includes('timeout 60000ms'),
		'The CLI must retain its 60000ms default timeout',
	);
	assert(
		fatal.output.includes('Container "fatal-fixture" exited with code 23'),
		'The fatal diagnostic must name the container and non-zero exit code',
	);
	assert(
		fatal.output.includes('Last 50 Docker log lines for "fatal-fixture"'),
		'The fatal diagnostic must identify the bounded log tail',
	);
	assert(
		fatal.output.includes('KNOWN_STARTUP_ERROR: fixture refused startup'),
		'The fatal diagnostic must include the entrypoint startup error',
	);
	assert(fatal.elapsedMs < 5000, 'A stopped container must abort before waiting out the timeout');

	const timedOut = await runWaitForHttp(fixtureBin, [
		'--url',
		'http://127.0.0.1:1/health',
		'--timeoutMs',
		'30',
		'--intervalMs',
		'5',
		'--container',
		'timeout-fixture',
	]);
	assert(timedOut.code !== 0, 'A readiness timeout must exit non-zero');
	assert(
		timedOut.output.includes(
			'Timed out waiting for http://127.0.0.1:1/health after 30ms' +
				' (container: "timeout-fixture")',
		),
		'Timeout output must name the URL, elapsed timeout, and container before diagnostics',
	);
	assert(
		timedOut.output.includes('Last 50 Docker log lines for "timeout-fixture"'),
		'Timeout diagnostics must identify the bounded log tail',
	);
	assert(
		timedOut.output.indexOf('Timed out waiting for') <
			timedOut.output.indexOf('Last 50 Docker log lines'),
		'Timeout context must print before its Docker diagnostics',
	);
	assert(
		timedOut.output.includes('fixture is still crash-looping'),
		'Timeout diagnostics must include the container log tail',
	);

	const dockerCalls = readFileSync(callsPath, 'utf8');
	assert(
		dockerCalls.includes('logs --tail 50 fatal-fixture'),
		'Fatal diagnostics must invoke docker logs with the fixed tail bound',
	);
	assert(
		dockerCalls.includes('logs --tail 50 timeout-fixture'),
		'Timeout diagnostics must invoke docker logs with the same fixed tail bound',
	);
	assert(!fatal.output.includes('PATH='), 'Diagnostics must not print environment variables');
	assert(
		!fatal.output.includes('{{.Config'),
		'Diagnostics must not print inspected container configuration',
	);

	const smoke = (await Bun.file(join(repoRoot, 'scripts/smoke.json')).json()) as SmokeConfig;
	const dockerProdCommands = smoke.modes['docker-prod']?.steps.map((step) => step.command);
	if (dockerProdCommands === undefined)
		throw new Error('Expected docker-prod smoke mode to exist');
	assert(
		dockerProdCommands.includes(
			'bun scripts/wait-for-http.ts --url http://localhost:{{FRONTEND_PORT}}/api/v1/health --timeoutMs 60000 --container {{APP_SLUG}}',
		),
		'Docker production readiness must retain its explicit timeout and container arguments',
	);

	console.log(`wait-for-http Docker diagnostic regression passed (${checks} assertions).`);
} catch (err: unknown) {
	console.error(`[FAIL] ${err instanceof Error ? err.message : String(err)}`);
	process.exit(1);
} finally {
	rmSync(fixtureRoot, { force: true, recursive: true });
}
