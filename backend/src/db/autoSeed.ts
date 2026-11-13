import type { AppConfig } from '../config/configSchema.ts';

import {
	formatCredentialsForDisplay,
	getCredentials,
	getSeedUsersWithPasswords,
	resolveCrawlEmail,
} from '../utils/auth/passwordGenerator.ts';
import { logger } from '../utils/logger.ts';
import { getDb } from './index.ts';
import { users } from './schema/users.ts';
import { resetDevSeedPasswords } from './seed/index.ts';
import { executeSeedOrchestration } from './seed/orchestration.ts';

/**
 * Auto-seed on startup when the users table is empty (SQLite only).
 *
 * This handles fresh installs where auto-migrations created the schema
 * but no seed data exists yet. Skips silently if users already exist.
 *
 * PostgreSQL note: This module uses synchronous Drizzle methods (.all(), .get(), .run())
 * which are only available with the SQLite dialect. PostgreSQL deployments must
 * run seeding manually via `bun run db:seed` adapted for async queries.
 */
async function runAutoSeed(config: AppConfig): Promise<void> {
	const db = getDb();

	const existingUsers = db.select().from(users).limit(1).all();
	if (existingUsers.length > 0) {
		return;
	}

	logger.info('No users found - auto-seeding database...');

	const isProduction = config.server.nodeEnv === 'production';
	const seedUserList = getSeedUsersWithPasswords(isProduction);
	const credentials = isProduction
		? seedUserList.map((u) => ({ password: u.password, username: u.username }))
		: getCredentials();

	const createdUsers = await executeSeedOrchestration(db, {
		bcryptRounds: config.security.bcryptRounds,
		crawlEmail: resolveCrawlEmail(config.testing.crawlLoginEmail, isProduction),
		seedUsers: seedUserList,
	});

	if (createdUsers) {
		// Credential plaintext never goes through the logger: log files are the exact place it
		// must not live. The display is written directly to the interactive console (TTY only),
		// which is the documented first-run channel; a non-interactive environment sees the
		// pointer line only. remediation-20261113-seed-credentials-logged-plaintext.
		const consoleIsInteractive = process.stdout.isTTY === true;
		if (consoleIsInteractive) {
			process.stdout.write(formatCredentialsForDisplay(credentials));
		} else if (isProduction) {
			logger.warn(
				'Production seed credentials were generated but stdout is not an interactive console; ' +
					're-run seeding from a console to display them, or use the password-reset flow. ' +
					'Credentials are never written to log files.',
			);
		}
		logger.info(`Auto-seed complete: ${createdUsers.length} users created`);
		if (isProduction) {
			logger.warn(
				'IMPORTANT: Save the displayed production credentials now - they cannot be retrieved later.',
			);
		}
	}
}

/**
 * Dev-only safety net: re-hash seed-user passwords to their documented dev
 * values on every startup when NODE_ENV=development.
 *
 * seedUsersIfEmpty() only runs on an empty users table, so once an admin's
 * password hash drifts (manual edits, stale DB, failed-login state, etc.)
 * the documented admin/admin123 login can fail silently. This resets the
 * hashes in-place without altering roles, emails, workspace membership, or
 * requiresPasswordChange policy. No-op in production.
 */
async function resetDevPasswordsIfDev(config: AppConfig): Promise<void> {
	if (config.server.nodeEnv !== 'development') {
		return;
	}

	const db = getDb();
	const seedUserList = getSeedUsersWithPasswords(false);

	await db.transaction(async (tx) => {
		await resetDevSeedPasswords(tx, seedUserList, config.security.bcryptRounds);
	});
}

export { resetDevPasswordsIfDev, runAutoSeed };
