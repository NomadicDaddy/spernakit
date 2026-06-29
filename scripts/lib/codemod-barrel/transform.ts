/**
 * Pure parsing/rewriting logic for the UI barrel-import codemod.
 *
 * Extracted from scripts/codemod-barrel-imports.ts (max-lines split). All
 * functions here are pure string transforms; file I/O stays in the
 * entrypoint script.
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ExportEntry {
	isTypeOnly: boolean;
	sourceFile: string; // e.g. 'button' (without .tsx)
}

export interface ParsedImportName {
	isType: boolean; // inline `type` keyword
	name: string;
}

interface BarrelImportMatch {
	fullMatch: string;
	isWholeStatementType: boolean; // `import type { ... }`
	names: ParsedImportName[];
	startIndex: number;
}

// ── Barrel file parser ──────────────────────────────────────────────────────

export function parseBarrelFile(content: string): Map<string, ExportEntry> {
	const exportMap = new Map<string, ExportEntry>();

	// Match: export { Name1, Name2 } from './source-file.tsx';
	// Match: export type { Name1, Name2 } from './source-file.tsx';
	const exportRegex = /export\s+(type\s+)?\{([^}]+)\}\s+from\s+'\.\/([^']+?)(?:\.tsx)?';/g;

	let match: null | RegExpExecArray;
	while ((match = exportRegex.exec(content)) !== null) {
		const isTypeOnly = match[1] !== undefined;
		const namesBlock = match[2] ?? '';
		const sourceFile = (match[3] ?? '').replace(/\.tsx$/, '');

		const names = namesBlock
			.split(',')
			.map((n) => n.trim())
			.filter((n) => n.length > 0);

		for (const name of names) {
			exportMap.set(name, { isTypeOnly, sourceFile });
		}
	}

	return exportMap;
}

// ── Import statement finder ─────────────────────────────────────────────────

function findBarrelImports(content: string): BarrelImportMatch[] {
	const matches: BarrelImportMatch[] = [];

	// Match both single-line and multi-line barrel imports
	// Handles: import { X } from '@/components/ui';
	//          import type { X } from '@/components/ui';
	//          import {\n\tX,\n\tY,\n} from '@/components/ui';
	const importRegex = /import\s+(type\s+)?\{([^}]+)\}\s+from\s+'@\/components\/ui';/g;

	let match: null | RegExpExecArray;
	while ((match = importRegex.exec(content)) !== null) {
		const isWholeStatementType = match[1] !== undefined;
		const namesBlock = match[2] ?? '';

		const names: ParsedImportName[] = namesBlock
			.split(',')
			.map((n) => n.trim())
			.filter((n) => n.length > 0)
			.map((n) => {
				if (n.startsWith('type ')) {
					return { isType: true, name: n.slice(5).trim() };
				}
				return { isType: false, name: n };
			});

		matches.push({
			fullMatch: match[0],
			isWholeStatementType,
			names,
			startIndex: match.index,
		});
	}

	return matches;
}

// ── Import line formatter ───────────────────────────────────────────────────

function formatImportLine(sourceFile: string, names: ParsedImportName[]): string {
	const allTypeOnly = names.every((n) => n.isType);
	const sortedNames = [...names].sort((a, b) => a.name.localeCompare(b.name));

	const typeKeyword = allTypeOnly ? 'type ' : '';
	const namesList = sortedNames
		.map((n) => {
			if (n.isType && !allTypeOnly) {
				return `type ${n.name}`;
			}
			return n.name;
		})
		.join(', ');

	const singleLine = `import ${typeKeyword}{ ${namesList} } from '@/components/ui/${sourceFile}';`;

	if (singleLine.length <= 100) {
		return singleLine;
	}

	// Multi-line format
	const lines = sortedNames.map((n) => {
		const prefix = n.isType && !allTypeOnly ? 'type ' : '';
		return `\t${prefix}${n.name},`;
	});

	return `import ${typeKeyword}{\n${lines.join('\n')}\n} from '@/components/ui/${sourceFile}';`;
}

// ── File processor ──────────────────────────────────────────────────────────

export function processFile(
	content: string,
	exportMap: Map<string, ExportEntry>,
	filePath: string
): { content: string; modified: boolean; warnings: string[] } {
	const warnings: string[] = [];
	const barrelImports = findBarrelImports(content);

	if (barrelImports.length === 0) {
		return { content, modified: false, warnings };
	}

	// Collect all imported names from all barrel imports in this file
	const allNames: ParsedImportName[] = [];
	for (const imp of barrelImports) {
		for (const n of imp.names) {
			const isType = imp.isWholeStatementType || n.isType;
			allNames.push({ isType, name: n.name });
		}
	}

	// Group by source file
	const grouped = new Map<string, ParsedImportName[]>();
	for (const n of allNames) {
		const entry = exportMap.get(n.name);
		if (!entry) {
			warnings.push(`  Unknown export '${n.name}' in ${filePath}`);
			continue;
		}
		const sourceFile = entry.sourceFile;
		if (!grouped.has(sourceFile)) {
			grouped.set(sourceFile, []);
		}
		grouped.get(sourceFile)!.push(n);
	}

	// Generate replacement imports, sorted by source file
	const sortedSourceFiles = [...grouped.keys()].sort();
	const replacementLines = sortedSourceFiles.map((sf) => formatImportLine(sf, grouped.get(sf)!));
	const replacement = replacementLines.join('\n');

	// Replace: put all new imports at the position of the first barrel import,
	// remove all other barrel imports
	let result = content;

	// Process in reverse order to preserve indices
	const sorted = [...barrelImports].sort((a, b) => b.startIndex - a.startIndex);

	const firstBarrelImport = barrelImports[0];
	for (const imp of sorted) {
		if (imp === firstBarrelImport) {
			// First barrel import (in original order) — replace with all new imports
			result =
				result.slice(0, imp.startIndex) +
				replacement +
				result.slice(imp.startIndex + imp.fullMatch.length);
		} else {
			// Subsequent barrel imports — remove entirely (including trailing newline)
			let endIndex = imp.startIndex + imp.fullMatch.length;
			if (result[endIndex] === '\n') {
				endIndex++;
			}
			result = result.slice(0, imp.startIndex) + result.slice(endIndex);
		}
	}

	return { content: result, modified: true, warnings };
}
