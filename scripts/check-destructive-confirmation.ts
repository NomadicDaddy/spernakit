#!/usr/bin/env bun
/**
 * Destructive Confirmation Check
 *
 * Enforces ASSERT-020: destructive user actions (delete, revoke, impersonate, purge)
 * MUST require an explicit confirmation step via ConfirmAlertDialog before dispatch.
 *
 * Scans all .tsx files for mutation hooks that target destructive endpoints and
 * verifies each destructive call has confirmation evidence within a window of
 * surrounding lines (whole-file matching produced false negatives: any stray
 * "confirmation" token anywhere in the file used to satisfy the check). An
 * opt-out marker is available for idempotent operations.
 *
 * Usage:
 *   bun scripts/check-destructive-confirmation.ts
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { projectRoot } from '../backend/src/config/configUtils.ts';

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'data', 'logs', 'coverage', '.aidd']);

/** Patterns indicating a destructive API endpoint. */
const DESTRUCTIVE_ENDPOINT_PATTERNS = [
	/method:\s*['"]DELETE['"]/i,
	/['"]\/api\/v1\/[^'"]*(?:delete|remove|revoke|purge|impersonate|wipe|destroy)[^'"]*['"]/i,
];

/** Pattern for useMutation usage that might involve destructive operations. */
const USE_MUTATION_PATTERN = /useMutation|mutate\(|mutateAsync\(/;

/**
 * Concrete confirmation primitives that must appear near the destructive call.
 * Deliberately excludes loose tokens (e.g. the bare word "confirmation") that
 * previously matched comments and unrelated copy anywhere in the file.
 */
const CONFIRMATION_EVIDENCE_PATTERN =
	/ConfirmAlertDialog|ConfirmDialog|AlertDialogAction|AlertDialog|onConfirm/;

/** Lines above/below a destructive call site searched for confirmation evidence. */
const EVIDENCE_WINDOW_LINES = 15;

/** Opt-out marker. */
const OPT_OUT_MARKER = '@no-confirm-required';

interface Violation {
	content: string;
	file: string;
	line: number;
	reason: string;
}

function* walkDir(dir: string): Generator<string> {
	const entries = readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walkDir(fullPath);
		} else if (entry.isFile() && entry.name.endsWith('.tsx')) {
			yield fullPath;
		}
	}
}

function checkFile(filePath: string): Violation[] {
	const content = readFileSync(filePath, 'utf-8');
	const relativePath = relative(projectRoot, filePath).replace(/\\/g, '/');
	const lines = content.split('\n');

	// If the file has no mutations, skip it
	if (!USE_MUTATION_PATTERN.test(content)) return [];

	// Check for destructive endpoint patterns in the same file
	const violations: Violation[] = [];

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;
		if (!line) continue;

		for (const pattern of DESTRUCTIVE_ENDPOINT_PATTERNS) {
			if (pattern.test(line)) {
				if (!hasScopedOptOut(lines, i) && !hasConfirmationEvidence(lines, i)) {
					violations.push({
						content: line.trim(),
						file: relativePath,
						line: i + 1,
						reason: 'destructive endpoint or method is not near a confirmation handler or scoped opt-out',
					});
				}
				break; // one violation per line
			}
		}
	}

	return violations;
}

function hasScopedOptOut(lines: string[], index: number): boolean {
	const start = Math.max(0, index - 3);
	const end = Math.min(lines.length - 1, index + 1);
	for (let i = start; i <= end; i++) {
		if (lines[i]?.includes(OPT_OUT_MARKER)) return true;
	}
	return false;
}

function hasConfirmationEvidence(lines: string[], index: number): boolean {
	const start = Math.max(0, index - EVIDENCE_WINDOW_LINES);
	const end = Math.min(lines.length - 1, index + EVIDENCE_WINDOW_LINES);
	for (let i = start; i <= end; i++) {
		const line = lines[i];
		if (line && CONFIRMATION_EVIDENCE_PATTERN.test(line)) return true;
	}
	return false;
}

// --- Main ---
const frontendSrc = join(projectRoot, 'frontend', 'src');

try {
	statSync(frontendSrc);
} catch {
	console.log('[OK] No frontend source directory found — check skipped.');
	process.exit(0);
}

const allViolations: Violation[] = [];

for (const filePath of walkDir(frontendSrc)) {
	allViolations.push(...checkFile(filePath));
}

if (allViolations.length > 0) {
	console.error('[FAIL] Found destructive API calls without confirmation dialog import:\n');
	for (const v of allViolations) {
		console.error(`  ${v.file}:${v.line}: ${v.content}`);
		console.error(`    ${v.reason}`);
	}
	console.error(
		'\nDestructive mutations must use ConfirmAlertDialog or a similar confirmation step.'
	);
	console.error(
		'Add a confirmation dialog import, or add // @no-confirm-required above the call.'
	);
	process.exit(1);
}

console.log('[OK] Destructive confirmation check passed.');
