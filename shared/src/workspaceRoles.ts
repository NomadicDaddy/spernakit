/**
 * Workspace-level role hierarchy using the same 1-5 numeric scale as global ROLE_HIERARCHY.
 * Higher values grant more privileges. Workspace roles do not include SYSOP (5) as that
 * is a global-only role that bypasses workspace membership entirely.
 *
 * Authorization checks use numeric comparison: userLevel >= requiredLevel
 *
 * Scale:
 * - VIEWER (1): Read-only access to workspace resources
 * - OPERATOR (2): Standard operations, data entry and modification
 * - MANAGER (3): Team and workspace member management
 * - ADMIN (4): Full workspace administration
 *
 * @see shared/src/roles.ts for global role hierarchy (includes SYSOP=5)
 */

type WorkspaceMemberRole = 'ADMIN' | 'MANAGER' | 'OPERATOR' | 'VIEWER';

const WORKSPACE_ROLES = {
	ADMIN: 'ADMIN',
	MANAGER: 'MANAGER',
	OPERATOR: 'OPERATOR',
	VIEWER: 'VIEWER',
} as const;

const WORKSPACE_ROLE_HIERARCHY: Record<WorkspaceMemberRole, number> = {
	ADMIN: 4,
	MANAGER: 3,
	OPERATOR: 2,
	VIEWER: 1,
};

export { WORKSPACE_ROLE_HIERARCHY, WORKSPACE_ROLES };
export type { WorkspaceMemberRole };
