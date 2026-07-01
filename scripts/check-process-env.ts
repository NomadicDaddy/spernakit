#!/usr/bin/env bun
/**
 * Process Environment Access Check
 *
 * Enforces ASSERT-035: only approved files may read process.env in application code.
 * The approved files are:
 *   - backend/src/config/configSecrets.ts (secret override reads)
 *   - backend/src/config/configLogger.ts  (NODE_ENV bootstrap read)
 *
 * Any other file that reads the environment (process.env, process['env'],
 * or Bun.env) will cause this check to fail, catching stray
 * environment-variable access that bypasses the typed config layer.
 *
 * Usage:
 *   bun scripts/check-process-env.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { projectRoot } from '../backend/src/config/configUtils.ts';

/** Files that are explicitly allowed to read process.env. */
const ALLOWED_FILES = new Set([
	'backend/src/config/configSecrets.ts',
	'backend/src/config/configLogger.ts',
]);

/**
 * Pattern to detect environment access: process.env (property access),
 * process['env'] / process["env"] (bracket access), and Bun.env.
 */
const PROCESS_ENV_PATTERN = /\bprocess\.env\b|\bprocess\s*\[\s*['"]env['"]\s*\]|\bBun\.env\b/;

/** Directories to skip entirely. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'data', 'logs', 'coverage', '.aidd']);

interface Violation {
	content: string;
	file: string;
	line: number;
}

function* walkDir(dir: string): Generator<string> {
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkDir(fullPath);
		} else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
			yield fullPath;
		}
	}
}

function checkFile(filePath: string): Violation[] {
	const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/');

	if (ALLOWED_FILES.has(relativePath)) return [];

	const content = readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const violations: Violation[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (!line) continue;
		// Skip comment-only lines (jsdoc, block, single-line) — process.env mentioned in
		// documentation should not be treated as a runtime access.
		const trimmed = line.trim();
		if (trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/*')) {
			continue;
		}
		if (PROCESS_ENV_PATTERN.test(line)) {
			violations.push({
				content: line.trim(),
				file: relativePath,
				line: i + 1,
			});
		}
	}

	return violations;
}

// --- Main ---
const backendSrc = join(projectRoot, 'backend', 'src');
const frontendSrc = join(projectRoot, 'frontend', 'src');
const sharedSrc = join(projectRoot, 'shared', 'src');

const allViolations: Violation[] = [];

for (const srcDir of [backendSrc, frontendSrc, sharedSrc]) {
	try {
		statSync(srcDir);
	} catch {
		continue;
	}

	for (const filePath of walkDir(srcDir)) {
		allViolations.push(...checkFile(filePath));
	}
}

if (allViolations.length > 0) {
	console.error('[FAIL] Found process.env access in files outside the approved whitelist:\n');
	for (const v of allViolations) {
		console.error(`  ${v.file}:${v.line}: ${v.content}`);
	}
	console.error(
		'\nOnly backend/src/config/configSecrets.ts and configLogger.ts may read process.env.'
	);
	console.error(
		'Add the value to SECRET_CONFIG_KEYS/NESTED_SECRET_KEYS or use the typed config layer.'
	);
	process.exit(1);
}

console.log('[OK] Process environment access check passed.');
