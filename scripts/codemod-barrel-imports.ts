#!/usr/bin/env bun
/**
 * Codemod: Eliminate UI component barrel imports
 *
 * Replaces `import { X, Y } from '@/components/ui'` with direct file imports
 * like `import { X } from '@/components/ui/button'`.
 *
 * Usage: bun scripts/codemod-barrel-imports.ts [--dry-run]
 *   Run from any spernakit app root directory.
 */

import { resolve, relative } from 'path';

import { parseBarrelFile, processFile } from './lib/codemod-barrel/transform.ts';

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
	const args = process.argv.slice(2);
	const dryRun = args.includes('--dry-run');
	const cwd = process.cwd();

	const barrelPath = resolve(cwd, 'frontend/src/components/ui/index.ts');
	const srcPath = resolve(cwd, 'frontend/src');

	// Read and parse barrel file
	const barrelFile = Bun.file(barrelPath);
	if (!(await barrelFile.exists())) {
		console.error(`Barrel file not found: ${barrelPath}`);
		process.exit(1);
	}

	const barrelContent = (await barrelFile.text()).replace(/\r\n/g, '\n');
	const exportMap = parseBarrelFile(barrelContent);
	console.log(
		`Parsed barrel file: ${exportMap.size} exports from ${new Set([...exportMap.values()].map((e) => e.sourceFile)).size} source files`
	);

	// Find all .ts/.tsx files
	const glob = new Bun.Glob('**/*.{ts,tsx}');
	const allFiles: string[] = [];
	for await (const path of glob.scan({ absolute: true, cwd: srcPath })) {
		// Skip the barrel file itself
		if (path.replace(/\\/g, '/').endsWith('components/ui/index.ts')) continue;
		allFiles.push(path);
	}

	console.log(`Scanning ${allFiles.length} files...`);

	let modifiedCount = 0;
	const allWarnings: string[] = [];

	for (const filePath of allFiles) {
		const file = Bun.file(filePath);
		const rawContent = await file.text();
		const hasCRLF = rawContent.includes('\r\n');
		const content = rawContent.replace(/\r\n/g, '\n');

		// Quick check — skip files without barrel imports
		if (!content.includes("from '@/components/ui';")) continue;

		const rel = relative(cwd, filePath).replace(/\\/g, '/');
		const result = processFile(content, exportMap, rel);

		if (result.warnings.length > 0) {
			allWarnings.push(...result.warnings);
		}

		if (!result.modified) continue;

		modifiedCount++;

		if (dryRun) {
			console.log(`\n[DRY RUN] ${rel}`);
			// Show the diff: find what changed
			const oldLines = content.split('\n');
			const newLines = result.content.split('\n');
			// Simple: just show the new import block for the first ~30 lines
			const maxPreview = 30;
			let diffStart = -1;
			let diffEnd = -1;
			for (let i = 0; i < Math.max(oldLines.length, newLines.length); i++) {
				if (oldLines[i] !== newLines[i]) {
					if (diffStart === -1) diffStart = i;
					diffEnd = i;
				}
			}
			if (diffStart >= 0) {
				const previewEnd = Math.min(diffEnd + 1, diffStart + maxPreview);
				console.log(`  Lines ${diffStart + 1}-${previewEnd + 1}:`);
				for (let i = diffStart; i <= previewEnd; i++) {
					if (i < newLines.length) {
						console.log(`  + ${newLines[i]}`);
					}
				}
				if (previewEnd < diffEnd) {
					console.log(`  ... (${diffEnd - previewEnd} more lines)`);
				}
			}
		} else {
			const output = hasCRLF ? result.content.replace(/\n/g, '\r\n') : result.content;
			await Bun.write(filePath, output);
			console.log(`  Updated: ${rel}`);
		}
	}

	if (allWarnings.length > 0) {
		console.log('\nWarnings:');
		for (const w of allWarnings) {
			console.log(w);
		}
	}

	if (!dryRun && modifiedCount > 0) {
		// Delete the barrel file
		const { unlinkSync } = await import('fs');
		unlinkSync(barrelPath);
		console.log(`\nDeleted: ${relative(cwd, barrelPath).replace(/\\/g, '/')}`);
	}

	console.log(
		`\n${dryRun ? '[DRY RUN] ' : ''}Done. ${modifiedCount} file${modifiedCount === 1 ? '' : 's'} ${dryRun ? 'would be ' : ''}modified.`
	);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
