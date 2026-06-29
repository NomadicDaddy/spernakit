import { randomUUID } from 'node:crypto';
import { lstat, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';

import type { StorageAdapter } from './types.ts';

import { projectRoot } from '../config/configUtils.ts';

const UPLOAD_DIR = resolve(projectRoot, 'data', 'uploads');

/**
 * Validates that a file path is within the upload directory.
 * Prevents path traversal attacks (e.g., ../../../etc/passwd).
 *
 * @param key - Relative path under uploads directory
 * @returns Validated absolute file path
 * @throws Error if path escapes upload directory
 */
function validatePath(key: string): string {
	const filePath = resolve(UPLOAD_DIR, key);
	const relativePath = relative(UPLOAD_DIR, filePath);

	// If relative path starts with '..' or is absolute, it escapes the upload dir
	if (relativePath.startsWith('..') || relative(UPLOAD_DIR, filePath) !== relativePath) {
		throw new Error('Invalid storage key: path traversal detected');
	}

	return filePath;
}

/**
 * Assert that the given path is not a symlink.
 * Prevents symlink-based path traversal attacks.
 *
 * @param filePath - Absolute file path to check
 * @throws Error if the path is a symbolic link
 */
async function assertNotSymlink(filePath: string): Promise<void> {
	try {
		const stat = await lstat(filePath);
		if (stat.isSymbolicLink()) {
			throw new Error('Symlink detected in storage path');
		}
	} catch (err: unknown) {
		if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return;
		throw err;
	}
}

/** Whether the upload directory has been lazily initialized. */
let dirInitialized = false;

/**
 * Ensure the upload directory exists (lazy, one-time).
 */
async function ensureUploadDir(): Promise<void> {
	if (dirInitialized) return;
	await mkdir(UPLOAD_DIR, { mode: 0o750, recursive: true });
	dirInitialized = true;
}

/**
 * Local filesystem storage adapter.
 * Stores files under data/uploads/ in the project root.
 * All I/O is async to avoid blocking the event loop.
 */
class LocalStorageAdapter implements StorageAdapter {
	/**
	 * Validate that the upload directory exists and is writable.
	 *
	 * @returns True if the local storage is ready
	 */
	async validateConnection(): Promise<boolean> {
		await ensureUploadDir();
		const testFile = resolve(UPLOAD_DIR, `.health-${Date.now()}.tmp`);
		await writeFile(testFile, 'ok', { mode: 0o640 });
		await unlink(testFile);
		return true;
	}

	/**
	 * Delete a file from local storage.
	 *
	 * @param key - Relative path under uploads directory
	 */
	async delete(key: string): Promise<void> {
		const filePath = validatePath(key);
		await assertNotSymlink(filePath);
		try {
			await unlink(filePath);
		} catch (err: unknown) {
			if (err instanceof Error && 'code' in err && err.code === 'ENOENT') return;
			throw err;
		}
	}

	/**
	 * Read a file from local storage.
	 *
	 * @param key - Relative path under uploads directory
	 * @returns File contents as a Buffer
	 */
	async read(key: string): Promise<Buffer> {
		const filePath = validatePath(key);
		await assertNotSymlink(filePath);
		return Buffer.from(await readFile(filePath));
	}

	/**
	 * Write a file to local storage atomically (temp file + rename) so a crash
	 * mid-write never leaves a partial blob at the final key.
	 *
	 * @param key - Relative path under uploads directory
	 * @param data - File contents
	 */
	async write(key: string, data: Buffer): Promise<void> {
		await ensureUploadDir();
		const filePath = validatePath(key);
		await assertNotSymlink(filePath);
		const dir = dirname(filePath);
		await assertNotSymlink(dir);
		await mkdir(dir, { mode: 0o750, recursive: true });
		const tempPath = `${filePath}.${randomUUID()}.tmp`;
		await writeFile(tempPath, data, { mode: 0o640 });
		try {
			await rename(tempPath, filePath);
		} catch (err) {
			await unlink(tempPath).catch(() => undefined);
			throw err;
		}
	}
}

export { LocalStorageAdapter, UPLOAD_DIR };
