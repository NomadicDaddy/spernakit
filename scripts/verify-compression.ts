#!/usr/bin/env bun
/**
 * verify-compression.ts
 *
 * Verifies that text compression is working, by probing the running backend for a
 * `Content-Encoding` header and by checking that every frontend build artifact above the
 * precompression threshold has a `.gz` and a `.br` sibling.
 *
 * Enforces: ASSERT-040 -- the production frontend MUST be served with `Content-Encoding: gzip`
 * for text assets >= 1 KiB.
 *
 * Modes (--mode, default "dev", matching scripts/smoke.json invocations):
 *   dev          — backend Content-Encoding is warn-only (the dev backend does
 *                  not sit behind nginx, so compression may legitimately be off)
 *   docker-local — compression expected; missing Content-Encoding is a failure
 *   docker-prod  — compression expected; missing Content-Encoding is a failure
 *
 * Run: bun run verify-compression [--mode dev|docker-local|docker-prod] [--root <dir>]
 */
import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { exit } from 'node:process';
import { parseArgs } from 'node:util';

import {
	log,
	logError,
	logInfo,
	logSuccess,
	logWarning,
	probeCompression,
} from './lib/compression-probe.ts';
import { loadJsonConfig } from './load-json-config';

/** The modes `scripts/smoke.json` invokes. Anything else is a typo, not a stricter run. */
const MODES = ['dev', 'docker-local', 'docker-prod'] as const;
type Mode = (typeof MODES)[number];

export interface CompressionOptions {
	/** Outside `dev`, a compressing reverse proxy is expected and a missing header is fatal. */
	mode?: string | undefined;
	root?: string | undefined;
}

/**
 * Probe the backend for a `Content-Encoding` header.
 *
 * Tries the direct backend URL first (works in `dev` and `docker-local`, where the backend port is
 * bound on the host); on connection failure falls back to the frontend-proxied API path (works in
 * `docker-prod`, where only the nginx-fronted port is exposed and nginx applies gzip/brotli to
 * backend responses).
 */
async function testBackendCompression(root: string, mode: Mode): Promise<boolean> {
	log('\n=== Testing Backend Compression ===\n', 'blue');

	const { config: appConfig } = loadJsonConfig(root);
	const backendUrl = appConfig.server?.backendUrl;
	const frontendUrl = appConfig.server?.frontendUrl;
	const compressionRequired = mode !== 'dev';

	if (!backendUrl) {
		logError('server.backendUrl not set in JSON config');
		return false;
	}

	const directOutcome = await probeCompression(new URL('/health', backendUrl));
	if (directOutcome.reachable) {
		if (directOutcome.contentEncoding) {
			logSuccess(`Compression enabled (direct): ${directOutcome.contentEncoding}`);
			return true;
		}
		if (compressionRequired) {
			logError(
				`No Content-Encoding on direct backend response — compression is required in mode "${mode}"`,
			);
			return false;
		}
		logWarning('No compression detected on direct backend (warn-only in dev mode)');
		return true;
	}

	if (!frontendUrl) {
		logError('Backend unreachable and server.frontendUrl not set for proxied fallback');
		return false;
	}

	logInfo('Direct backend unreachable — falling back to nginx-proxied path');
	const proxiedOutcome = await probeCompression(new URL('/api/v1/health', frontendUrl));
	if (!proxiedOutcome.reachable) {
		logError('Both direct and proxied backend probes failed');
		logWarning('Start `bun run dev:backend` (dev) or ensure docker stack is up (docker-prod)');
		return false;
	}

	if (proxiedOutcome.contentEncoding) {
		logSuccess(`Compression enabled (proxied): ${proxiedOutcome.contentEncoding}`);
		return true;
	}

	if (compressionRequired) {
		logError(
			`Proxied path reachable but returned no Content-Encoding — compression is required in mode "${mode}"`,
		);
		return false;
	}

	logWarning('Proxied path returned no Content-Encoding (warn-only in dev mode)');
	return true;
}

/** Every `.js` and `.css` artifact under `dir`, recursively, excluding precompressed siblings. */
async function findFiles(dir: string, fileList: string[] = []): Promise<string[]> {
	for (const file of await readdir(dir)) {
		const filePath = join(dir, file);
		const stats = await stat(filePath);
		if (stats.isDirectory()) {
			await findFiles(filePath, fileList);
		} else if (file.endsWith('.js') || file.endsWith('.css')) {
			fileList.push(filePath);
		}
	}
	return fileList;
}

interface BuildResult {
	/** Artifacts above the threshold that carry both a `.gz` and a `.br` sibling. */
	compressedFiles: number;
	ok: boolean;
	/** Artifacts below the threshold, deliberately not precompressed. */
	skippedFiles: number;
}

/**
 * Check that every frontend build artifact above the threshold is precompressed.
 *
 * Returns the counts as well as the verdict, because the caller's success line has to state them:
 * a build that emitted nothing passes this loop vacuously, and `compressedFiles === 0` is how a reader
 * tells that apart from a build that was actually checked.
 */
async function testFrontendBuildCompression(root: string): Promise<BuildResult> {
	log('\n=== Testing Frontend Build Compression ===\n', 'blue');

	const distPath = join(root, 'frontend', 'dist', 'assets');
	const empty: BuildResult = { compressedFiles: 0, ok: false, skippedFiles: 0 };

	let allFiles: string[];
	try {
		allFiles = await findFiles(distPath);
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		logError(`Frontend test failed: ${typedErr.message}`);
		logWarning('Make sure the frontend is built: bun run build:frontend');
		return empty;
	}

	const jsFiles = allFiles.filter((f) => f.endsWith('.js'));
	const cssFiles = allFiles.filter((f) => f.endsWith('.css'));

	if (jsFiles.length === 0 && cssFiles.length === 0) {
		logWarning('No build artifacts found');
		logInfo('Run: bun run build:frontend');
		return empty;
	}

	logInfo(`Found ${jsFiles.length} JS files and ${cssFiles.length} CSS files`);

	// Matches the `threshold` passed to vite-plugin-compression2 in frontend/vite.config.ts.
	// Files below this size are intentionally not precompressed — compression overhead on
	// tiny chunks (lucide icon files, skeleton components) outweighs any transfer-size win.
	const COMPRESSION_THRESHOLD_BYTES = 1024;

	const result: BuildResult = { compressedFiles: 0, ok: true, skippedFiles: 0 };

	for (const filePath of [...jsFiles, ...cssFiles]) {
		const fileStats = await stat(filePath);
		const fileSize = fileStats.size;
		const fileName = filePath.split(/[/\\]/).pop() ?? 'unknown';

		log(`\nFile: ${fileName}`, 'cyan');
		logInfo(`  Original: ${(fileSize / 1024).toFixed(2)} KB`);

		if (fileSize < COMPRESSION_THRESHOLD_BYTES) {
			logInfo(`  Skipped: below ${COMPRESSION_THRESHOLD_BYTES}-byte compression threshold`);
			result.skippedFiles += 1;
			continue;
		}

		let both = true;
		// nginx-mod-http-brotli and vite-plugin-compression2 require a `.br` sibling as well.
		for (const [label, path] of [
			['Gzip', `${filePath}.gz`],
			['Brotli', `${filePath}.br`],
		] as const) {
			try {
				const size = (await stat(path)).size;
				const ratio = ((1 - size / fileSize) * 100).toFixed(1);
				logSuccess(`  ${label}: ${(size / 1024).toFixed(2)} KB (${ratio}% reduction)`);
			} catch {
				logError(`  ${label}: Not found`);
				both = false;
			}
		}
		if (both) result.compressedFiles += 1;
		else result.ok = false;
	}

	return result;
}

/**
 * Run the gate. Returns the process exit code: 0 pass, 1 findings.
 *
 * The success line states how many artifacts were precompressed and how many fell below the
 * threshold, because both populations are discovered by walking `frontend/dist/assets`. Without
 * the counts, a run against an empty build reads exactly like a run against a correct one.
 */
export async function runCompression(options: CompressionOptions = {}): Promise<number> {
	const root = resolve(options.root ?? join(import.meta.dir, '..'));
	const mode = (options.mode ?? 'dev') as Mode;

	log('\n=== Compression Verification ===\n', 'blue');

	const backendOk = await testBackendCompression(root, mode);
	const build = await testFrontendBuildCompression(root);

	// Section verdicts stay on the detail helpers rather than the status markers. A marker line
	// per section reads as the gate's own verdict -- and the first one here carries no count,
	// which is the vacuity rule 5 bans. There is one status line, at the end, and it has counts.
	log('\n=== Summary ===\n', 'blue');
	for (const [label, ok] of [
		['Backend compression', backendOk],
		['Frontend build compression', build.ok],
	] as const) {
		if (ok) logSuccess(label);
		else logError(label);
	}

	if (!backendOk || !build.ok) {
		log(`\n[FAIL] verify-compression -- mode "${mode}", see errors above\n`, 'red');
		return 1;
	}

	log(
		`\n[OK] verify-compression -- mode "${mode}", ${build.compressedFiles} artifact(s) precompressed, ` +
			`${build.skippedFiles} below the threshold\n`,
		'green',
	);
	return 0;
}

if (import.meta.main) {
	// `parseArgs` throws on an unknown flag, and an uncaught throw exits 1 -- the code reserved for
	// findings. An unrecognized `--mode` is the same class of mistake: before this check existed a
	// typo silently selected the strict path, which reports a compression failure about a mode
	// nobody runs. Both map onto 2 here.
	let options: CompressionOptions;
	try {
		const { values } = parseArgs({
			args: Bun.argv.slice(2),
			options: {
				mode: { type: 'string' },
				root: { type: 'string' },
			},
			strict: true,
		});
		if (values.mode !== undefined && !MODES.includes(values.mode as Mode)) {
			throw new Error(`unknown --mode ${values.mode}; expected one of ${MODES.join(', ')}`);
		}
		options = { mode: values.mode, root: values.root };
	} catch (err) {
		logError(`verify-compression: ${(err as Error).message}`);
		log('Usage: verify-compression [--mode dev|docker-local|docker-prod] [--root <dir>]');
		exit(2);
	}
	exit(await runCompression(options));
}
