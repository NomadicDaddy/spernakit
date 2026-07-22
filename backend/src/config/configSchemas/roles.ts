import { Type, withDefault } from '../configSchemaHelpers';

export const roleDisplaySchema = Type.Object({
	description: Type.String(),
	label: Type.String(),
});

export const rolesSchema = Type.Object({
	ADMIN: withDefault(roleDisplaySchema, {
		description: 'Application administration, user management',
		label: 'Administrator',
	}),
	MANAGER: withDefault(roleDisplaySchema, {
		description: 'Team and workspace member management',
		label: 'Manager',
	}),
	OPERATOR: withDefault(roleDisplaySchema, {
		description: 'Standard operations, data entry and modification',
		label: 'Operator',
	}),
	SYSOP: withDefault(roleDisplaySchema, {
		description: 'System administration, cross-workspace access',
		label: 'System Operator',
	}),
	VIEWER: withDefault(roleDisplaySchema, {
		description: 'Read-only access to permitted resources',
		label: 'Viewer',
	}),
});
