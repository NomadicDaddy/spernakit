/** Emit one real rotated-file log from the caller's working directory. */
import { parseArgs } from 'node:util';

import { appConfigSchema } from '../../backend/src/config/configSchema.ts';
import { loadDefaults } from '../../backend/src/config/configUtils.ts';
import { createLoggerForConfig } from '../../backend/src/utils/logger.ts';

const { values } = parseArgs({
	args: process.argv.slice(2),
	options: { file: { type: 'string' } },
	strict: true,
});
const configuredPath = values.file;
if (!configuredPath) throw new Error('A fixture log path is required');

const parsed = appConfigSchema.safeParse(loadDefaults());
if (!parsed.success) throw new Error('Fixture defaults must satisfy the application schema');
const config = parsed.data;
config.server.nodeEnv = 'production';
config.logging.file.enabled = true;
config.logging.file.path = configuredPath;

const logger = createLoggerForConfig(config);
logger.info('logger working-directory fixture');
await new Promise<void>((resolve, reject) => {
	logger.flush((error) => {
		if (error) reject(error);
		else resolve();
	});
});
