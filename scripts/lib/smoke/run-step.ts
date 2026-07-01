/**
 * Step execution for the smoke test runner: cache-aware command running and
 * cache status reporting.
 */
import { join } from 'node:path';

import { canSkipStep, getCacheStatus, recordStepResult } from '../../smoke-cache.ts';
import { createChildEnv } from './env.ts';
import { rewriteBunCommand } from './shell.ts';

export interface Step {
	command: string;
	description: string;
	logFile?: string;
}

function getStepKey(command: string): string {
	const match = command.match(/bun run (\S+)/);
	return match?.[1] ?? command;
}

export async function showCacheStatus(projectRoot: string, steps: Step[]): Promise<void> {
	const stepKeys = steps.map((s) => getStepKey(s.command));
	const statuses = await getCacheStatus(projectRoot, stepKeys);

	console.log('\nCache Status:');
	console.log('─'.repeat(70));

	for (const status of statuses) {
		const icon = status.cached ? '✓' : '○';
		const state = status.cached ? 'CACHED' : 'PENDING';
		console.log(`${icon} ${status.step.padEnd(20)} ${state.padEnd(10)} ${status.reason}`);
	}

	console.log('─'.repeat(70));
}

export async function runCommand(
	projectRoot: string,
	command: string,
	description: string,
	shell: string[],
	force: boolean,
	useCache: boolean,
	logFile?: string
): Promise<void> {
	const stepKey = getStepKey(command);

	if (useCache && !force) {
		const { reason, skip } = await canSkipStep(projectRoot, stepKey);
		if (skip) {
			console.log(`\n==> ${description}`);
			console.log(`    [CACHED] ${reason}`);
			return;
		}
	}

	console.log(`\n==> ${description}`);
	console.log(`    ${command}`);

	const startTime = performance.now();
	let exitCode: number;
	const spawnCommand = rewriteBunCommand(command);

	if (logFile) {
		const logPath = join(projectRoot, logFile);
		const fileWriter = Bun.file(logPath).writer();

		const proc = Bun.spawn([...shell, spawnCommand], {
			cwd: projectRoot,
			env: createChildEnv(),
			stderr: 'pipe',
			stdin: 'inherit',
			stdout: 'pipe',
		});

		const pipe = async (stream: ReadableStream<Uint8Array>, output: NodeJS.WriteStream) => {
			for await (const chunk of stream) {
				output.write(chunk);
				fileWriter.write(chunk);
			}
		};

		await Promise.all([pipe(proc.stdout, process.stdout), pipe(proc.stderr, process.stderr)]);
		fileWriter.end();
		exitCode = await proc.exited;
	} else {
		const proc = Bun.spawn([...shell, spawnCommand], {
			cwd: projectRoot,
			env: createChildEnv(),
			stdio: ['inherit', 'inherit', 'inherit'],
		});
		exitCode = await proc.exited;
	}

	const duration = Math.round(performance.now() - startTime);

	if (exitCode !== 0) {
		console.error(`[FAIL] ${description} (exit code ${exitCode})`);
		if (useCache) {
			await recordStepResult(projectRoot, stepKey, 'fail', duration);
		}
		process.exit(exitCode);
	}

	console.log(`[OK] ${description}`);
	if (useCache) {
		await recordStepResult(projectRoot, stepKey, 'pass', duration);
	}
}
