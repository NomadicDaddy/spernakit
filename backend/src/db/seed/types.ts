import type { BunSQLiteDatabase } from 'drizzle-orm/bun-sqlite';
import type { WorkspaceMemberRole } from 'spernakit-shared';

import type { AppConfig } from '../../config/configSchema.ts';
import type { UserRole } from '../../types/roles.ts';
import type * as schema from '../schema/index.ts';

type SeedDb = BunSQLiteDatabase<typeof schema>;

type WorkspaceRoleMap = Record<UserRole, WorkspaceMemberRole>;

interface SeedUser {
	email: string;
	password: string;
	role: UserRole;
	username: string;
}

interface CreatedUser {
	id: number;
	role: string;
	username: string;
}

export type {
	AppConfig,
	CreatedUser,
	SeedDb,
	SeedUser,
	UserRole,
	WorkspaceMemberRole,
	WorkspaceRoleMap,
};
