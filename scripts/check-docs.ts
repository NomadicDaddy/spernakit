#!/usr/bin/env bun
/**
 * Validates that internal links in Markdown documentation files resolve to existing files.
 *
 * Scans all .md files in the project root, docs/, and scripts/ directories.
 * Extracts inline links [text](path) and checks that each target file exists.
 * Skips external links (http/https/mailto), anchor-only links (#heading),
 * and image data URIs.
 *
 * Usage:
 *   bun scripts/check-docs.ts
 *   bun run check-docs
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..');

/** Directories to exclude from scanning */
const EXCLUDE_DIRS = new Set([
	'.aidd',
	'.claude',
	'.git',
	'.github',
	'backups',
	'coverage',
	'data',
	'dist',
	'logs',
	'node_modules',
	'screenshots',
]);

/** Prefixes that indicate an external or non-file link */
const EXTERNAL_PREFIXES = ['http://', 'https://', 'mailto:', 'data:', 'tel:'];

interface BrokenLink {
	file: string;
	line: number;
	linkText: string;
	target: string;
}

/**
 * True when git ignores this path. A doc-link checker has no business validating links inside
 * gitignored scratch or vendored trees: they are not shipped, and their markdown is frequently
 * third-party and malformed. Falls open (returns false) when git cannot answer — not a repo, git
 * missing — so scanning outside a repository is unchanged.
 */
function isGitIgnored(path: string): boolean {
	const result = Bun.spawnSync(['git', 'check-ignore', '-q', path], {
		stderr: 'ignore',
		stdout: 'ignore',
	});
	return result.exitCode === 0;
}

/**
 * Recursively discover all .md files under a directory, excluding specified dirs.
 */
function findMarkdownFiles(dir: string): string[] {
	const results: string[] = [];

	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		if (entry.isDirectory()) {
			if (EXCLUDE_DIRS.has(entry.name)) continue;
			const full = join(dir, entry.name);
			if (isGitIgnored(full)) continue;
			results.push(...findMarkdownFiles(full));
		} else if (entry.isFile() && entry.name.endsWith('.md')) {
			results.push(join(dir, entry.name));
		}
	}

	return results;
}

/**
 * Check whether a link target is external (http, mailto, etc.) or anchor-only.
 */
function isExternalOrAnchor(target: string): boolean {
	if (target.startsWith('#')) return true;
	const lower = target.toLowerCase();
	return EXTERNAL_PREFIXES.some((prefix) => lower.startsWith(prefix));
}

/**
 * Extract inline markdown links from a file and validate each target.
 */
function checkFile(filePath: string): BrokenLink[] {
	const content = readFileSync(filePath, 'utf-8');
	const lines = content.split('\n');
	const fileDir = dirname(filePath);
	const broken: BrokenLink[] = [];

	// Match inline links: [text](path) but not images ![alt](path) which may use data URIs
	const linkRegex = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
	let inCodeBlock = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]!;

		// Track fenced code block state
		if (line.trimStart().startsWith('```')) {
			inCodeBlock = !inCodeBlock;
			continue;
		}
		if (inCodeBlock) continue;

		// Strip inline code spans to avoid matching links inside backticks
		const lineWithoutCode = line.replace(/`[^`]+`/g, '');

		let match: null | RegExpExecArray;
		linkRegex.lastIndex = 0;

		while ((match = linkRegex.exec(lineWithoutCode)) !== null) {
			const linkText = match[1]!;
			let target = match[2]!.trim();

			// Skip external and anchor-only links
			if (isExternalOrAnchor(target)) continue;

			// Skip template placeholders like [ADR-001-link]
			if (target.startsWith('[') && target.endsWith(']')) continue;

			// Strip anchor from file path (e.g., "STACK.md#section" → "STACK.md")
			const anchorIndex = target.indexOf('#');
			if (anchorIndex > 0) {
				target = target.substring(0, anchorIndex);
			}

			// Strip query params (e.g., "file.md?v=1" → "file.md")
			const queryIndex = target.indexOf('?');
			if (queryIndex > 0) {
				target = target.substring(0, queryIndex);
			}

			// Resolve relative to the file's directory
			const resolved = resolve(fileDir, target);

			if (!existsSync(resolved)) {
				// Also check if it resolves relative to project root (some docs use root-relative paths)
				const fromRoot = resolve(PROJECT_ROOT, target);
				if (!existsSync(fromRoot)) {
					broken.push({
						file: filePath,
						line: i + 1,
						linkText,
						target,
					});
				}
			}
		}
	}

	return broken;
}

function main(): void {
	console.log('Checking documentation links...\n');

	const mdFiles = findMarkdownFiles(PROJECT_ROOT);
	const allBroken: BrokenLink[] = [];

	for (const file of mdFiles) {
		const broken = checkFile(file);
		allBroken.push(...broken);
	}

	if (allBroken.length === 0) {
		console.log(`✅ All links valid across ${mdFiles.length} markdown files`);
		process.exit(0);
	}

	// Group by file
	const grouped = new Map<string, BrokenLink[]>();
	for (const link of allBroken) {
		const relative = link.file.replace(`${PROJECT_ROOT}\\`, '').replaceAll('\\', '/');
		const existing = grouped.get(relative) ?? [];
		existing.push(link);
		grouped.set(relative, existing);
	}

	console.error(`❌ Found ${allBroken.length} broken link(s) across ${grouped.size} file(s):\n`);

	for (const [file, links] of grouped) {
		console.error(`  ${file}`);
		for (const link of links) {
			console.error(`    Line ${link.line}: [${link.linkText}](${link.target})`);
		}
		console.error();
	}

	process.exit(1);
}

main();
