#!/usr/bin/env bun
import { resolve } from 'node:path';

import { getConfig, initializeConfig } from '../backend/src/config/configLoader.ts';
import { projectRoot } from '../backend/src/config/configUtils.ts';
import { assertDbUnderDataDir } from '../backend/src/config/databaseLocation.ts';
import { closeDatabase, initializeDatabase } from '../backend/src/db/index.ts';
import { rotateFieldEncryption } from '../backend/src/services/fieldEncryptionRotationService.ts';

const config = initializeConfig();
if (!config.security.encryptionKeyPrevious) {
	console.error('security.encryptionKeyPrevious is required for field-encryption rotation');
	process.exit(1);
}
if (config.database.dialect !== 'sqlite') {
	console.error('Field-encryption rotation currently requires the supported SQLite runtime');
	process.exit(1);
}
const location = assertDbUnderDataDir(config.database, projectRoot);
if (!location.ok) throw new Error(location.message);
const configuredPath = getConfig().database.url.replace(/^file:/, '');
const databasePath = resolve(projectRoot, configuredPath.replace(/^\.\//, ''));

initializeDatabase(databasePath, 'sqlite', undefined, config.database.busyTimeoutMs);
try {
	const result = await rotateFieldEncryption({
		current: config.security.encryptionKey,
		previous: config.security.encryptionKeyPrevious,
	});
	console.log(`Rotated ${result.processed} encrypted database field(s).`);
} finally {
	await closeDatabase();
}
