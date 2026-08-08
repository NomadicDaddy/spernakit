/**
 * Filesystem scans for the application consistency checker.
 *
 * Extracted from scripts/check-application.ts (max-lines split). Finds stray
 * .db files and rogue data/backup folders outside their sanctioned locations.
 */
import fs from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const EXCLUDE_DIRECTORIES: readonly string[] = [
	'.cache',
	'.git',
	'.idea',
	'.next',
	'.turbo',
	'.vscode',
	'.worktrees',
	'backups',
	'build',
	'coverage',
	'dist',
	'node_modules',
	'temp',
	'tmp',
];

export interface DbFileScan {
	/**
	 * Entries the walk actually examined, after exclusions.
	 *
	 * This scan swallows every error to survive permission problems, so a walk that reached nothing
	 * returns the same empty file list as a genuinely clean tree. The count is what separates them,
	 * and rule 5 of `docs/reference/gate-conventions.md` requires the caller to report it.
	 */
	examined: number;
	files: string[];
}

export async function findDbFiles(dir: string, basePath = ''): Promise<DbFileScan> {
	const files: string[] = [];
	let examined = 0;

	try {
		const entries = await readdir(dir);

		for (const entry of entries) {
			const fullPath = path.join(dir, entry);
			const relativePath = path.join(basePath, entry);

			if (EXCLUDE_DIRECTORIES.includes(entry)) {
				continue;
			}
			examined += 1;

			const stats = await stat(fullPath);
			if (stats.isDirectory()) {
				const sub = await findDbFiles(fullPath, relativePath);
				files.push(...sub.files);
				examined += sub.examined;
				continue;
			}

			if (entry.endsWith('.db')) {
				files.push(relativePath);
			}
		}
	} catch {
		// Ignore permission errors and continue
	}

	return { examined, files };
}

/**
 * Find rogue data/ or backup/ folders that exist outside the root directory.
 * These folders are restricted to root only - no backend/data or backend/backup.
 *
 * Only checks immediate children of backend/ and frontend/ directories to avoid
 * false positives on legitimate source code folders like backend/src/services/backup.
 */
export async function findRogueFolders(repoRoot: string): Promise<string[]> {
	const rogueFolders: string[] = [];
	const restrictedNames = ['data', 'backup', 'backups'];
	const workspaceDirs = ['backend', 'frontend'];

	for (const workspace of workspaceDirs) {
		const workspacePath = path.join(repoRoot, workspace);

		if (!fs.existsSync(workspacePath)) {
			continue;
		}

		try {
			const entries = await readdir(workspacePath);

			for (const entry of entries) {
				const fullPath = path.join(workspacePath, entry);
				const relativePath = path.join(workspace, entry);

				const stats = await stat(fullPath);
				if (stats.isDirectory() && restrictedNames.includes(entry.toLowerCase())) {
					rogueFolders.push(relativePath);
				}
			}
		} catch {
			// Ignore permission errors and continue
		}
	}

	return rogueFolders;
}
