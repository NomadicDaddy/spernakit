import {
	BarChart3,
	Bell,
	Building2,
	FileText,
	LayoutDashboard,
	LayoutGrid,
	Rocket,
	Settings,
} from 'lucide-react';

import type { AppFeatures } from '@/api/appFeatures';
import type { UserRole } from '@/types/roles';

/** Extract only the boolean keys from AppFeatures for use as feature flags. */
type BooleanAppFeatureKey = {
	[K in keyof AppFeatures]: AppFeatures[K] extends boolean ? K : never;
}[keyof AppFeatures];

interface NavItem {
	featureFlag?: BooleanAppFeatureKey;
	icon: React.ReactNode;
	label: string;
	minRole?: UserRole;
	to: string;
	type?: never;
}

interface NavSeparator {
	label: string;
	type: 'separator';
}

type NavEntry = NavItem | NavSeparator;

const navEntries: NavEntry[] = [
	{
		icon: <LayoutDashboard aria-hidden="true" className="size-5" />,
		label: 'Home',
		to: '/dashboard',
	},
	{
		featureFlag: 'onboardingEnabled',
		icon: <Rocket aria-hidden="true" className="size-5" />,
		label: 'Onboarding',
		minRole: 'ADMIN',
		to: '/onboarding',
	},
	{
		featureFlag: 'notificationsEnabled',
		icon: <Bell aria-hidden="true" className="size-5" />,
		label: 'Notifications',
		to: '/notifications',
	},
	{
		featureFlag: 'dashboardsEnabled',
		icon: <LayoutGrid aria-hidden="true" className="size-5" />,
		label: 'Custom Dashboards',
		to: '/dashboards',
	},
	{
		featureFlag: 'analyticsEnabled',
		icon: <BarChart3 aria-hidden="true" className="size-5" />,
		label: 'Analytics',
		minRole: 'OPERATOR',
		to: '/analytics',
	},
	{
		icon: <Settings aria-hidden="true" className="size-5" />,
		label: 'Settings',
		minRole: 'ADMIN',
		to: '/settings',
	},
	{
		featureFlag: 'filesEnabled',
		icon: <FileText aria-hidden="true" className="size-5" />,
		label: 'Files',
		minRole: 'OPERATOR',
		to: '/files',
	},
	{
		featureFlag: 'workspacesEnabled',
		icon: <Building2 aria-hidden="true" className="size-5" />,
		label: 'Workspaces',
		to: '/workspaces',
	},
];

/** Flat list without separators — used by template-managed layout components. */
const navItems: NavItem[] = navEntries.filter((e): e is NavItem => e.type !== 'separator');

/** Visibility filter returning NavItem[] — used by template-managed layout components. */
function getVisibleNavItems(
	hasMinRole: (role: UserRole) => boolean,
	appFeatures: AppFeatures
): NavItem[] {
	return navItems.filter(
		(item) =>
			(!item.minRole || hasMinRole(item.minRole)) &&
			(!item.featureFlag || appFeatures[item.featureFlag])
	);
}

export { getVisibleNavItems, navEntries, navItems };
export type { NavEntry, NavItem, NavSeparator };
