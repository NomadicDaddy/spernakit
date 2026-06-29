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

export async function findDbFiles(dir: string, basePath = ''): Promise<string[]> {
	const dbFiles: string[] = [];

	try {
		const entries = await readdir(dir);

		for (const entry of entries) {
			const fullPath = path.join(dir, entry);
			const relativePath = path.join(basePath, entry);

			if (EXCLUDE_DIRECTORIES.includes(entry)) {
				continue;
			}

			const stats = await stat(fullPath);
			if (stats.isDirectory()) {
				const subFiles = await findDbFiles(fullPath, relativePath);
				dbFiles.push(...subFiles);
				continue;
			}

			if (entry.endsWith('.db')) {
				dbFiles.push(relativePath);
			}
		}
	} catch {
		// Ignore permission errors and continue
	}

	return dbFiles;
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
