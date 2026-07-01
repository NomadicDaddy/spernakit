import type { StorageAdapter } from './types.ts';

import { getConfig } from '../config/configLoader.ts';
import { logger } from '../utils/logger.ts';
import { LocalStorageAdapter } from './localAdapter.ts';
import { S3StorageAdapter } from './s3Adapter.ts';

let adapter: null | StorageAdapter = null;

/**
 * Get the configured storage adapter (singleton).
 * On first call, validates connectivity and logs the result.
 *
 * @returns Storage adapter instance
 */
function getStorageAdapter(): StorageAdapter {
	if (adapter) return adapter;

	const config = getConfig();
	if (config.storage.adapter === 's3') {
		adapter = new S3StorageAdapter();
	} else {
		adapter = new LocalStorageAdapter();
	}

	// Fire-and-forget connectivity check at initialization
	const current = adapter;
	void current.validateConnection().then(
		() => logger.info({ adapter: config.storage.adapter }, 'Storage adapter validated'),
		(err) =>
			logger.error(
				{ adapter: config.storage.adapter, error: err },
				'Storage adapter validation failed'
			)
	);

	return adapter;
}

export { getStorageAdapter };
