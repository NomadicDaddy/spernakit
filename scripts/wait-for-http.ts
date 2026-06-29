#!/usr/bin/env bun
/**
 * wait-for-http.ts
 * Readiness probe that polls an HTTP endpoint until it responds with 2xx.
 * Optionally monitors a Docker container for OOM kills and crashes.
 *
 * Usage:
 *   bun scripts/wait-for-http.ts --url http://localhost:{port}/health --timeoutMs 60000 --intervalMs 1000
 *   bun scripts/wait-for-http.ts --url http://localhost:3330/api/v1/health --container spernakit-dev
 */

interface ParsedArgs {
	[key: string]: string | undefined;
}

function parseArgs(argv: string[]): ParsedArgs {
	const args: ParsedArgs = {};
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (!arg || !arg.startsWith('--')) continue;
		const [key, value] = arg.slice(2).split('=');
		if (!key) continue;
		if (value !== undefined) {
			args[key] = value;
			continue;
		}
		const next = argv[i + 1];
		if (next && !next.startsWith('--')) {
			args[key] = next;
			i += 1;
			continue;
		}
		args[key] = '';
	}
	return args;
}

interface ContainerState {
	exitCode: number;
	oomKilled: boolean;
	restartCount: number;
	running: boolean;
}

/**
 * Inspect a Docker container's state for OOM kills, crashes, and restarts.
 *
 * @param containerName - Docker container name or ID
 * @returns Parsed container state, or null if inspection fails
 */
async function inspectContainer(containerName: string): Promise<ContainerState | null> {
	try {
		const format =
			'{{.State.OOMKilled}} {{.State.ExitCode}} {{.RestartCount}} {{.State.Running}}';
		const proc = Bun.spawn(['docker', 'inspect', '--format', format, containerName], {
			stderr: 'pipe',
			stdout: 'pipe',
		});
		const stdout = await new Response(proc.stdout).text();
		const exitCode = await proc.exited;
		if (exitCode !== 0) return null;

		const parts = stdout.trim().split(' ');
		if (parts.length < 4) return null;

		return {
			exitCode: Number(parts[1]) || 0,
			oomKilled: parts[0] === 'true',
			restartCount: Number(parts[2]) || 0,
			running: parts[3] === 'true',
		};
	} catch {
		return null;
	}
}

/**
 * Check container health and abort with a diagnostic message if OOM-killed or crashed.
 *
 * @param containerName - Docker container name
 * @returns true if a fatal condition was detected (caller should exit)
 */
async function checkContainerHealth(containerName: string): Promise<boolean> {
	const state = await inspectContainer(containerName);
	if (!state) return false;

	if (state.oomKilled) {
		console.error(
			`[wait-for-http] FATAL: Container "${containerName}" was OOM-killed.` +
				' The process exceeded the container memory limit.' +
				' Check for unbounded memory allocation (large file reads, uncapped collections, etc).'
		);
		return true;
	}

	if (!state.running && state.exitCode === 137) {
		console.error(
			`[wait-for-http] FATAL: Container "${containerName}" exited with code 137 (SIGKILL).` +
				' This typically indicates an OOM kill by the kernel.'
		);
		return true;
	}

	if (state.restartCount > 0) {
		console.error(
			`[wait-for-http] WARNING: Container "${containerName}" has restarted` +
				` ${state.restartCount} time(s) (exit code: ${state.exitCode}).` +
				' The container may be crash-looping.'
		);
	}

	return false;
}

async function main(): Promise<void> {
	const argv = process.argv.slice(2);
	const args = parseArgs(argv);

	const url = args['url'];
	if (!url) {
		console.error(
			'[wait-for-http] Missing required --url argument (e.g. --url http://localhost:{port}/health)'
		);
		process.exit(1);
	}

	const containerName = args['container'];
	const timeoutMsRaw = args['timeoutMs'];
	const intervalMsRaw = args['intervalMs'];
	const timeoutMs = timeoutMsRaw ? Number(timeoutMsRaw) || 60000 : 60000;
	const intervalMs = intervalMsRaw ? Number(intervalMsRaw) || 1000 : 1000;

	const start = Date.now();
	const containerInfo = containerName ? `, container: ${containerName}` : '';
	console.log(
		`[wait-for-http] Waiting for ${url} (timeout ${timeoutMs}ms, interval ${intervalMs}ms${containerInfo})`
	);

	while (Date.now() - start < timeoutMs) {
		try {
			const res = await fetch(url, { method: 'GET' });
			if (res.ok) {
				console.log(`[wait-for-http] Ready: ${url} responded with ${res.status}`);
				process.exit(0);
			}
			console.log(
				`[wait-for-http] Not ready yet: ${url} responded with ${res.status} ${res.statusText}`
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			console.log(`[wait-for-http] Error: ${message}`);
		}

		if (containerName) {
			const fatal = await checkContainerHealth(containerName);
			if (fatal) process.exit(1);
		}

		await Bun.sleep(intervalMs);
	}

	console.error(`[wait-for-http] Timed out waiting for ${url} after ${timeoutMs}ms`);
	process.exit(1);
}

main().catch((err: unknown) => {
	console.error('[wait-for-http] Fatal error:', err);
	process.exit(1);
});
