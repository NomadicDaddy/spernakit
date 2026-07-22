#!/usr/bin/env bun
/**
 * Database seed script.
 * Creates default users, workspace, and domain seed data for development.
 *
 * Note: This script uses synchronous Drizzle methods (.all(), .get(), .run())
 * which are only available with the SQLite dialect. For PostgreSQL seeding,
 * these calls must be converted to their async equivalents.
 */
import { resolve } from 'node:path';

import { initializeConfig } from '../config/configLoader.ts';
import { projectRoot } from '../config/configUtils.ts';
import {
	formatCredentialsForDisplay,
	getCredentials,
	getSeedUsersWithPasswords,
} from '../utils/auth/passwordGenerator.ts';
import { logDatabase } from '../utils/logger.ts';
import { closeDatabase, initializeDatabase } from './index.ts';
import { users } from './schema/users.ts';
import { workspaceMembers } from './schema/workspaces.ts';
import { executeSeedOrchestration } from './seed/orchestration.ts';

const config = initializeConfig();
const bcryptRounds = config.security.bcryptRounds;

// Initialize database
const dbDialect = config.database.dialect;
const dbUrl = config.database.url;

if (dbDialect === 'postgres') {
	logDatabase('error', 'This seed script uses synchronous SQLite methods.');
	logDatabase(
		'error',
		'For PostgreSQL, use drizzle-kit push and adapt the seed to async queries.'
	);
	process.exit(1);
}

const dbPath = dbUrl.startsWith('file:') ? dbUrl.substring(5) : dbUrl;
const absoluteDbPath = resolve(projectRoot, dbPath.startsWith('./') ? dbPath.substring(2) : dbPath);
const db = initializeDatabase(absoluteDbPath, 'sqlite');

async function seed(): Promise<void> {
	logDatabase('info', 'Seeding database...');

	const nodeEnv = config.server.nodeEnv;
	const isProduction = nodeEnv === 'production';
	if (isProduction) {
		logDatabase('warn', 'Running seed in production - only default accounts will be created');
	}

	const seedUserList = getSeedUsersWithPasswords(isProduction);
	const credentials = isProduction
		? seedUserList.map((u) => ({ password: u.password, username: u.username }))
		: getCredentials();
	if (!isProduction) {
		logDatabase('info', formatCredentialsForDisplay(credentials));
	} else {
		logDatabase('info', formatCredentialsForDisplay(credentials));
		logDatabase(
			'warn',
			'IMPORTANT: Save these production credentials now - they cannot be retrieved later. ' +
				'All accounts require password change on first login.'
		);
	}

	const createdUsers = await executeSeedOrchestration(db, {
		bcryptRounds,
		crawlEmail: config.testing.crawlLoginEmail,
		seedUsers: seedUserList,
	});

	if (!createdUsers) {
		return;
	}

	// Verify the seed (outside transaction — read committed data)
	const finalCount = db.select().from(users).all().length;
	const wsCount = db.select().from(workspaceMembers).all().length;
	logDatabase('info', `Seed complete: ${finalCount} users, ${wsCount} workspace members`);
}

seed()
	.catch((err: unknown) => {
		logDatabase('error', 'Seed failed', {
			error: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	})
	.finally(async () => {
		await closeDatabase();
	});
