import { S3Client } from 'bun';

import type { StorageAdapter } from './types.ts';

import { getConfig } from '../config/configLoader.ts';
import { logger } from '../utils/logger.ts';

const MAX_KEY_LENGTH = 1024;

const ALLOWED_KEY_PATTERN = /^[a-zA-Z0-9\-_./]+$/;

function validateKey(key: string): void {
	if (typeof key !== 'string' || key.length === 0) {
		throw new Error('Invalid S3 key: key must be a non-empty string');
	}

	if (key.length > MAX_KEY_LENGTH) {
		throw new Error(`Invalid S3 key: key exceeds maximum length of ${MAX_KEY_LENGTH}`);
	}

	if (key.startsWith('/') || key.startsWith('\\')) {
		throw new Error('Invalid S3 key: key must not start with a path separator');
	}

	if (key.includes('..') || key.includes('//')) {
		throw new Error('Invalid S3 key: key contains invalid path sequences');
	}

	if (!ALLOWED_KEY_PATTERN.test(key)) {
		throw new Error('Invalid S3 key: key contains invalid characters');
	}
}

/**
 * S3-compatible storage adapter.
 *
 * Uses Bun's built-in S3 client (`Bun.s3`) for file storage with
 * S3-compatible services like Amazon S3, Google Cloud Storage, Cloudflare R2,
 * and MinIO.
 *
 * Configuration is read from `config.storage.s3` (accessKeyId, secretAccessKey,
 * bucket, region, endpoint).
 */
class S3StorageAdapter implements StorageAdapter {
	private client: S3Client;

	constructor() {
		const config = getConfig();

		const { accessKeyId, bucket, endpoint, region, secretAccessKey } = config.storage.s3;

		if (!accessKeyId || !secretAccessKey || !bucket || !region) {
			throw new Error(
				'S3 storage adapter requires accessKeyId, secretAccessKey, bucket, and region in config.storage.s3'
			);
		}

		this.client = new S3Client({
			accessKeyId,
			bucket,
			region,
			secretAccessKey,
			...(endpoint ? { endpoint } : {}),
		});
	}

	/**
	 * Validate S3 connectivity by checking if the bucket exists.
	 *
	 * @returns True if the S3 connection and bucket are valid
	 */
	async validateConnection(): Promise<boolean> {
		try {
			// Attempt to check existence of a known-absent key to validate credentials + bucket
			await this.client.file('.health-check-probe').exists();
			logger.info('S3 storage connectivity validated');
			return true;
		} catch (err) {
			logger.error({ error: err }, 'S3 storage connectivity validation failed');
			throw err;
		}
	}

	/**
	 * Delete a file from S3 storage.
	 *
	 * @param key - S3 object key
	 */
	async delete(key: string): Promise<void> {
		validateKey(key);
		try {
			await this.client.file(key).delete();
			logger.info({ key }, 'Deleted file from S3');
		} catch (err) {
			logger.error({ error: err, key }, 'Failed to delete file from S3');
			throw err;
		}
	}

	/**
	 * Read a file from S3 storage.
	 *
	 * @param key - S3 object key
	 * @returns File contents as a Buffer
	 */
	async read(key: string): Promise<Buffer> {
		validateKey(key);
		try {
			const arrayBuffer = await this.client.file(key).arrayBuffer();
			logger.info({ key, size: arrayBuffer.byteLength }, 'Read file from S3');
			return Buffer.from(arrayBuffer);
		} catch (err) {
			logger.error({ error: err, key }, 'Failed to read file from S3');
			throw err;
		}
	}

	/**
	 * Write a file to S3 storage.
	 *
	 * @param key - S3 object key
	 * @param data - File contents
	 */
	async write(key: string, data: Buffer): Promise<void> {
		validateKey(key);
		try {
			await this.client.write(key, data, {
				type: 'application/octet-stream',
			});
			logger.info({ key, size: data.length }, 'Wrote file to S3');
		} catch (err) {
			logger.error({ error: err, key }, 'Failed to write file to S3');
			throw err;
		}
	}
}

export { S3StorageAdapter };
