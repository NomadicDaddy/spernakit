/**
 * Storage adapter interface for file persistence.
 */
interface StorageAdapter {
	/**
	 * Delete a file from storage.
	 *
	 * @param key - Storage key
	 */
	delete(key: string): Promise<void>;

	/**
	 * Read a file from storage.
	 *
	 * @param key - Storage key
	 * @returns File contents as a Buffer
	 */
	read(key: string): Promise<Buffer>;

	/**
	 * Validate that the storage backend is reachable and configured correctly.
	 * Should be called during initialization to surface misconfigurations early.
	 *
	 * @returns True if the connection is valid
	 * @throws Error with details if validation fails
	 */
	validateConnection(): Promise<boolean>;

	/**
	 * Write a file to storage.
	 *
	 * @param key - Storage key (relative path)
	 * @param data - File contents
	 */
	write(key: string, data: Buffer): Promise<void>;
}

export type { StorageAdapter };
