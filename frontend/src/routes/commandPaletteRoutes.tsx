import type { ReactNode } from 'react';

import { Bug, Database, Key, Settings, Shield, User } from 'lucide-react';

import type { UserRole } from '@/types/roles';

import { profileTabs } from '@/pages/profile/profileTabs';
import { settingsTabs } from '@/pages/settings/settingsTabs';
import { SETTINGS_AREA_MIN_ROLE } from '@/routes/settingsArea';

interface CommandPaletteRoute {
	icon: ReactNode;
	label: string;
	minRole?: UserRole;
	path: string;
}

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

/** Tabs that read better with their own icon; every other tab, an app's own included, gets User. */
const profileTabIcons: Record<string, ReactNode> = {
	'/profile/api-keys': <Key aria-hidden="true" className="size-4" />,
	'/profile/security': <Shield aria-hidden="true" className="size-4" />,
};

/**
 * One palette entry per profile tab, built from `profileTabs` for the same reason the settings
 * entries are built from `settingsTabs`: the tab strip is what a derived app customizes, and a
 * hand-kept copy here would offer a swapped-out tab's route while never offering its replacement.
 *
 * The bare `/profile` entry is not a tab, so it stays declared here. The profile area carries no
 * role floor — unlike `/settings`, `/profile` is not wrapped in a `ProtectedRoute` with a required
 * role — so an entry takes a role only when its own tab names one.
 */
const profileRoutes: CommandPaletteRoute[] = [
	{
		icon: <User aria-hidden="true" className="size-4" />,
		label: 'Profile',
		path: '/profile',
	},
	...profileTabs.map((tab) => ({
		icon: profileTabIcons[tab.to] ?? <User aria-hidden="true" className="size-4" />,
		label: `Profile: ${tab.label}`,
		// Spread rather than assigned, because `exactOptionalPropertyTypes` rejects an explicit
		// `undefined` where the property is merely optional.
		...(tab.minRole ? { minRole: tab.minRole } : {}),
		path: tab.to,
	})),
];

const commandPaletteRoutes: CommandPaletteRoute[] = [...settingsRoutes, ...profileRoutes];

export { commandPaletteRoutes };
