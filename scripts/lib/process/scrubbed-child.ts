#!/usr/bin/env bun
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadJsonConfig } from '../../load-json-config.ts';
import { collectConfiguredSecrets, SecretScrubber } from './secret-scrubber.ts';

const scrubbedChildPath = fileURLToPath(import.meta.url);

function runScrubbedChild(argv = process.argv.slice(2)): void {
	const [repoRoot, logsDir, name, cwd, command, ...args] = argv;
	if (!repoRoot || !logsDir || !name || !cwd || !command) {
		console.error('scrubbed-child requires repo root, logs directory, name, cwd, and command');
		process.exit(2);
	}

	const { config } = loadJsonConfig(repoRoot);
	const secrets = collectConfiguredSecrets(repoRoot, config);
	const stdout = fs.createWriteStream(path.join(logsDir, `${name}.log`), { flags: 'a' });
	const stderr = fs.createWriteStream(path.join(logsDir, `${name}.error.log`), { flags: 'a' });
	const stdoutScrubber = new SecretScrubber(secrets);
	const stderrScrubber = new SecretScrubber(secrets);
	const child = spawn(command, args, {
		cwd,
		env: process.env, // allow-env-spread-policy: supervisor input is already narrowly allowlisted.
		shell: false,
		stdio: ['ignore', 'pipe', 'pipe'],
		windowsHide: true,
	});

	child.stdout?.on('data', (chunk: Buffer) => stdout.write(stdoutScrubber.push(chunk)));
	child.stderr?.on('data', (chunk: Buffer) => stderr.write(stderrScrubber.push(chunk)));

	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.on(signal, () => child.kill(signal));
	}

	child.on('error', (error) => stderr.write(`Child process error: ${error.message}\n`));
	child.on('close', (code) => {
		stdout.end(stdoutScrubber.finish());
		stderr.end(stderrScrubber.finish());
		// Do not call process.exit() here. The scrubbers deliberately retain a tail so secrets split
		// across chunks cannot leak, and WriteStream.end() may still be flushing that tail on Linux.
		// Setting the exit code lets both streams drain before the supervisor exits naturally.
		process.exitCode = code ?? 1;
	});
}

if (import.meta.main) runScrubbedChild();

export { runScrubbedChild, scrubbedChildPath };
