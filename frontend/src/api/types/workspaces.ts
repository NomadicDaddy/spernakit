import type { WorkspaceMemberRole } from 'spernakit-shared';

interface WorkspaceBranding {
	accentColor?: string;
	logoFileId?: number;
}

interface WorkspaceSettings {
	branding?: WorkspaceBranding;
	currency?: string;
	defaultDashboardId?: number;
	timezone?: string;
}

/** Workspace */
interface Workspace {
	createdAt: string;
	description: null | string;
	id: number;
	isDefault: boolean;
	name: string;
	ownerId: number;
	ownerUsername: null | string;
	settings: null | WorkspaceSettings;
	slug: string;
	updatedAt: string;
}

/** Workspace member */
interface WorkspaceMember {
	joinedAt: string;
	role: WorkspaceMemberRole;
	userId: number;
	username: string;
	workspaceId: number;
}

export type { Workspace, WorkspaceMember, WorkspaceSettings };
