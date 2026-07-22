#!/usr/bin/env bun
/**
 * Compression Verification Script
 *
 * This script verifies that text compression is working correctly
 * by testing both backend API responses and frontend build artifacts.
 *
 * Modes (--mode, default "dev", matching scripts/smoke.json invocations):
 *   dev          — backend Content-Encoding is warn-only (the dev backend does
 *                  not sit behind nginx, so compression may legitimately be off)
 *   docker-local — compression expected; missing Content-Encoding is a failure
 *   docker-prod  — compression expected; missing Content-Encoding is a failure
 */
import { readdir, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
	log,
	logError,
	logInfo,
	logSuccess,
	logWarning,
	probeCompression,
} from './lib/compression-probe.ts';
import { loadJsonConfig } from './load-json-config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

// Load JSON config at startup
const { config: appConfig } = loadJsonConfig(ROOT_DIR);

// Parse --mode (aligned with scripts/smoke.json). Anything other than "dev"
// expects a compressing reverse proxy in front of the backend, so a missing
// Content-Encoding header is a hard failure there.
const modeIdx = process.argv.indexOf('--mode');
const mode = modeIdx !== -1 && process.argv[modeIdx + 1] ? process.argv[modeIdx + 1] : 'dev';
const compressionRequired = mode !== 'dev';

/**
 * Test backend compression. Probes the direct backend URL first (works in `dev` and
 * `docker-local` modes where port 3331 is bound on the host); on connection failure
 * falls back to the frontend-proxied API path (works in `docker-prod` where only the
 * nginx-fronted port 3330 is exposed and nginx applies gzip/brotli to backend responses).
 */
async function testBackendCompression(): Promise<boolean> {
	log('\n=== Testing Backend Compression ===\n', 'blue');

	const backendUrl = appConfig.server?.backendUrl;
	const frontendUrl = appConfig.server?.frontendUrl;

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
				`No Content-Encoding on direct backend response — compression is required in mode "${mode}"`
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
			`Proxied path reachable but returned no Content-Encoding — compression is required in mode "${mode}"`
		);
		return false;
	}

	logWarning('Proxied path returned no Content-Encoding (warn-only in dev mode)');
	return true;
}

/**
 * Test frontend build compression
 */
async function testFrontendBuildCompression(): Promise<boolean> {
	log('\n=== Testing Frontend Build Compression ===\n', 'blue');

	const distPath = join(__dirname, '..', 'frontend', 'dist', 'assets');

	try {
		// Recursively find all JS and CSS files
		async function findFiles(dir: string, fileList: string[] = []): Promise<string[]> {
			const files = await readdir(dir);
			for (const file of files) {
				const filePath = join(dir, file);
				const stats = await stat(filePath);
				if (stats.isDirectory()) {
					await findFiles(filePath, fileList);
				} else if (file.endsWith('.js') || file.endsWith('.css')) {
					if (!file.endsWith('.gz') && !file.endsWith('.br')) {
						fileList.push(filePath);
					}
				}
			}
			return fileList;
		}

		const allFiles = await findFiles(distPath);
		const jsFiles = allFiles.filter((f) => f.endsWith('.js'));
		const cssFiles = allFiles.filter((f) => f.endsWith('.css'));

		if (jsFiles.length === 0 && cssFiles.length === 0) {
			logWarning('No build artifacts found');
			logInfo('Run: bun run build:frontend');
			return false;
		}

		logInfo(`Found ${jsFiles.length} JS files and ${cssFiles.length} CSS files`);

		// Matches the `threshold` passed to vite-plugin-compression2 in frontend/vite.config.ts.
		// Files below this size are intentionally not precompressed — compression overhead on
		// tiny chunks (lucide icon files, skeleton components) outweighs any transfer-size win.
		const COMPRESSION_THRESHOLD_BYTES = 1024;

		let allCompressed = true;

		for (const filePath of [...jsFiles, ...cssFiles]) {
			const gzPath = `${filePath}.gz`;
			const brPath = `${filePath}.br`;

			const fileStats = await stat(filePath);
			const fileSize = fileStats.size;
			const fileName = filePath.split(/[/\\]/).pop() ?? 'unknown';

			log(`\nFile: ${fileName}`, 'cyan');
			logInfo(`  Original: ${(fileSize / 1024).toFixed(2)} KB`);

			if (fileSize < COMPRESSION_THRESHOLD_BYTES) {
				logInfo(
					`  Skipped: below ${COMPRESSION_THRESHOLD_BYTES}-byte compression threshold`
				);
				continue;
			}

			// Check for .gz file
			try {
				const gzStats = await stat(gzPath);
				const gzSize = gzStats.size;
				const gzRatio = ((1 - gzSize / fileSize) * 100).toFixed(1);
				logSuccess(`  Gzip: ${(gzSize / 1024).toFixed(2)} KB (${gzRatio}% reduction)`);
			} catch {
				logError(`  Gzip: Not found`);
				allCompressed = false;
			}

			// nginx-mod-http-brotli and vite-plugin-compression2 require a .br sibling.
			try {
				const brStats = await stat(brPath);
				const brSize = brStats.size;
				const brRatio = ((1 - brSize / fileSize) * 100).toFixed(1);
				logSuccess(`  Brotli: ${(brSize / 1024).toFixed(2)} KB (${brRatio}% reduction)`);
			} catch {
				logError(`  Brotli: Not found`);
				allCompressed = false;
			}
		}

		return allCompressed;
	} catch (err: unknown) {
		const typedErr = err instanceof Error ? err : new Error(String(err));
		logError(`Frontend test failed: ${typedErr.message}`);
		logWarning('Make sure the frontend is built: bun run build:frontend');
		return false;
	}
}

/**
 * Main function
 */
async function main(): Promise<void> {
	log('\n╔════════════════════════════════════════════════════════════╗', 'blue');
	log('║         Compression Verification Script                   ║', 'blue');
	log('╚════════════════════════════════════════════════════════════╝', 'blue');

	const backendResult = await testBackendCompression();
	const frontendResult = await testFrontendBuildCompression();

	log('\n=== Summary ===\n', 'blue');

	if (backendResult) {
		logSuccess('Backend compression: WORKING');
	} else {
		logError('Backend compression: FAILED');
	}

	if (frontendResult) {
		logSuccess('Frontend build compression: WORKING');
	} else {
		logError('Frontend build compression: FAILED');
	}

	if (backendResult && frontendResult) {
		log('\n✓ All compression checks passed!', 'green');
		log('  Lighthouse Critical Priority #1 is RESOLVED\n', 'green');
		process.exit(0);
	} else {
		log('\n✗ Some compression checks failed', 'red');
		log('  See errors above for details\n', 'red');
		process.exit(1);
	}
}

main().catch((error: unknown) => {
	logError(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
});
