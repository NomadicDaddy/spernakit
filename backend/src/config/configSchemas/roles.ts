import { z } from 'zod';

export const roleDisplaySchema = z.object({
	description: z.string(),
	label: z.string(),
});

export const rolesSchema = z.object({
	ADMIN: roleDisplaySchema.default({
		description: 'Application administration, user management',
		label: 'Administrator',
	}),
	MANAGER: roleDisplaySchema.default({
		description: 'Team and workspace member management',
		label: 'Manager',
	}),
	OPERATOR: roleDisplaySchema.default({
		description: 'Standard operations, data entry and modification',
		label: 'Operator',
	}),
	SYSOP: roleDisplaySchema.default({
		description: 'System administration, cross-workspace access',
		label: 'System Operator',
	}),
	VIEWER: roleDisplaySchema.default({
		description: 'Read-only access to permitted resources',
		label: 'Viewer',
	}),
});
