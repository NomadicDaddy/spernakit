import type { CreatedUser, SeedDb, WorkspaceRoleMap } from './types.ts';

import { logDatabase } from '../../utils/logger.ts';
import { workspaceMembers, workspaces } from '../schema/workspaces.ts';

function createDefaultWorkspace(db: SeedDb, ownerId: number) {
	return db
		.insert(workspaces)
		.values({
			description: 'Default workspace for all users',
			isDefault: true,
			name: 'Default',
			ownerId,
			slug: 'default',
		})
		.returning({ id: workspaces.id })
		.get();
}

function addUsersToDefaultWorkspace(
	db: SeedDb,
	createdUsers: CreatedUser[],
	workspaceId: number,
	roleMap: WorkspaceRoleMap
): void {
	for (const user of createdUsers) {
		const wsRole = roleMap[user.role as keyof WorkspaceRoleMap];
		if (wsRole) {
			db.insert(workspaceMembers)
				.values({
					role: wsRole,
					userId: user.id,
					workspaceId,
				})
				.run();
			logDatabase('info', `Added ${user.username} to Default workspace`, {
				role: wsRole,
			});
		}
	}
}

export { addUsersToDefaultWorkspace, createDefaultWorkspace };
