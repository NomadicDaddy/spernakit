import type { ReactNode } from 'react';

import { Bug, Database, Key, Settings, Shield, User } from 'lucide-react';

import type { UserRole } from '@/types/roles';

import { settingsTabs } from '@/pages/settings/settingsTabs';

interface CommandPaletteRoute {
	icon: ReactNode;
	label: string;
	minRole?: UserRole;
	path: string;
}

/**
 * The settings area is guarded at ADMIN (the `/settings` route and its nav entry), so a tab that
 * names no role of its own is reachable from ADMIN up.
 */
const SETTINGS_AREA_MIN_ROLE: UserRole = 'ADMIN';

/** Tabs that read better with their own icon; every other tab, an app's own included, gets Settings. */
const settingsTabIcons: Record<string, ReactNode> = {
	'/settings/backup': <Database aria-hidden="true" className="size-4" />,
	'/settings/bugs': <Bug aria-hidden="true" className="size-4" />,
	'/settings/database': <Database aria-hidden="true" className="size-4" />,
};

/**
 * One palette entry per settings tab, built from `settingsTabs` rather than a second list. Derived
 * apps customize the tab strip there, and a hand-kept copy here offered a swapped-out tab's route
 * (a 404) while never offering the tab that replaced it.
 */
const settingsRoutes: CommandPaletteRoute[] = settingsTabs.map((tab) => ({
	icon: settingsTabIcons[tab.to] ?? <Settings aria-hidden="true" className="size-4" />,
	label: `Settings: ${tab.label}`,
	minRole: tab.minRole ?? SETTINGS_AREA_MIN_ROLE,
	path: tab.to,
}));

const profileRoutes: CommandPaletteRoute[] = [
	{
		icon: <User aria-hidden="true" className="size-4" />,
		label: 'Profile',
		path: '/profile',
	},
	{
		icon: <User aria-hidden="true" className="size-4" />,
		label: 'Profile: Personal Info',
		path: '/profile/personal',
	},
	{
		icon: <User aria-hidden="true" className="size-4" />,
		label: 'Profile: Preferences',
		path: '/profile/preferences',
	},
	{
		icon: <Shield aria-hidden="true" className="size-4" />,
		label: 'Profile: Security',
		path: '/profile/security',
	},
	{
		icon: <Key aria-hidden="true" className="size-4" />,
		label: 'Profile: API Keys',
		path: '/profile/api-keys',
	},
];

const commandPaletteRoutes: CommandPaletteRoute[] = [...settingsRoutes, ...profileRoutes];

export { commandPaletteRoutes };
