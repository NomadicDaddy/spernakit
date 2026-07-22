import { eq } from 'drizzle-orm';

import type { CreatedUser, SeedDb, SeedUser, WorkspaceRoleMap } from './types.ts';

import { users } from '../schema/users.ts';
import { workspaceRoleMap } from './constants.ts';
import { addUsersToDefaultWorkspace, createDefaultWorkspace, seedUsersIfEmpty } from './index.ts';

interface SeedOrchestrationConfig {
	bcryptRounds: number;
	crawlEmail: string | undefined;
	seedUsers: SeedUser[];
}

/**
 * Shared seeding orchestration used by both CLI seed.ts and autoSeed.ts.
 *
 * Within a transaction:
 * 1. Seeds users if the users table is empty
 * 2. Clears requiresPasswordChange for the crawl user (if configured)
 * 3. Creates the default workspace with sysop as owner
 * 4. Adds all created users to the default workspace with role mapping
 *
 * @returns Array of created users, or null if users already existed
 */
async function executeSeedOrchestration(
	db: SeedDb,
	config: SeedOrchestrationConfig
): Promise<CreatedUser[] | null> {
	return db.transaction(async (tx) => {
		const created = await seedUsersIfEmpty(tx, config.seedUsers, config.bcryptRounds);
		if (!created) {
			return null;
		}

		// Clear requiresPasswordChange for crawl user so automated tests work
		if (config.crawlEmail) {
			tx.update(users)
				.set({ requiresPasswordChange: false })
				.where(eq(users.email, config.crawlEmail))
				.run();
		}

		const sysopUser = created.find((u) => u.username === 'sysop');
		if (!sysopUser) {
			throw new Error('sysop user not found after creation');
		}

		const workspace = createDefaultWorkspace(tx, sysopUser.id);
		addUsersToDefaultWorkspace(tx, created, workspace.id, workspaceRoleMap);

		return created;
	});
}

export { executeSeedOrchestration };
export type { SeedOrchestrationConfig, WorkspaceRoleMap };
