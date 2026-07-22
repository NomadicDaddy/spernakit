import type { ReactNode } from 'react';

import { Bug, Database, Key, Settings, Shield, User } from 'lucide-react';

import type { UserRole } from '@/types/roles';

interface CommandPaletteRoute {
	icon: ReactNode;
	label: string;
	minRole?: UserRole;
	path: string;
}

const commandPaletteRoutes: CommandPaletteRoute[] = [
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Application',
		minRole: 'ADMIN',
		path: '/settings/application',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Authentication',
		minRole: 'SYSOP',
		path: '/settings/authentication',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Users',
		minRole: 'ADMIN',
		path: '/settings/users',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Roles',
		minRole: 'ADMIN',
		path: '/settings/roles',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Notifications',
		minRole: 'ADMIN',
		path: '/settings/notifications',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Email',
		minRole: 'SYSOP',
		path: '/settings/email',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: System Health',
		minRole: 'ADMIN',
		path: '/settings/system-health',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Scheduled Tasks',
		minRole: 'ADMIN',
		path: '/settings/scheduled-tasks',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Audit Logs',
		minRole: 'ADMIN',
		path: '/settings/audit-logs',
	},
	{
		icon: <Database aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Backup',
		minRole: 'SYSOP',
		path: '/settings/backup',
	},
	{
		icon: <Database aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Database',
		minRole: 'SYSOP',
		path: '/settings/database',
	},
	{
		icon: <Settings aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Runtime Config',
		minRole: 'SYSOP',
		path: '/settings/runtime-config',
	},
	{
		icon: <Bug aria-hidden="true" className="mr-2 size-4" />,
		label: 'Settings: Bug Reports',
		minRole: 'ADMIN',
		path: '/settings/bugs',
	},
	{
		icon: <User aria-hidden="true" className="mr-2 size-4" />,
		label: 'Profile',
		path: '/profile',
	},
	{
		icon: <User aria-hidden="true" className="mr-2 size-4" />,
		label: 'Profile: Personal Info',
		path: '/profile/personal',
	},
	{
		icon: <User aria-hidden="true" className="mr-2 size-4" />,
		label: 'Profile: Preferences',
		path: '/profile/preferences',
	},
	{
		icon: <Shield aria-hidden="true" className="mr-2 size-4" />,
		label: 'Profile: Security',
		path: '/profile/security',
	},
	{
		icon: <Key aria-hidden="true" className="mr-2 size-4" />,
		label: 'Profile: API Keys',
		path: '/profile/api-keys',
	},
];

export { commandPaletteRoutes };
