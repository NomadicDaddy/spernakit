import {
	Bug,
	Database,
	Key,
	Moon,
	PanelLeftClose,
	PanelLeftOpen,
	Settings,
	Shield,
	Sun,
	User,
} from 'lucide-react';
import { cloneElement, isValidElement, startTransition } from 'react';

import type { UserRole } from '@/types/roles';

import { updateUserUiSettings } from '@/api/userSettings';
import { navItems } from '@/components/layout/navConfig';
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from '@/components/ui/command';
import { useCommandStore } from '@/stores/commandStore';
import { useSidebarStore } from '@/stores/sidebarStore';
import { useThemeStore } from '@/stores/themeStore';

/** Sub-routes not present in navConfig (settings tabs, profile tabs). */
const SUB_ROUTES: { icon: React.ReactNode; label: string; minRole?: UserRole; path: string }[] = [
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

/** Resize a navConfig icon element for command palette display. */
function resizeIcon(icon: React.ReactNode): React.ReactNode {
	if (isValidElement<{ className?: string }>(icon)) {
		return cloneElement(icon, { className: 'mr-2 size-4' });
	}
	return icon;
}

/** A single page or action entry displayed in the command palette. */
interface CommandOption {
	icon: React.ReactNode;
	label: string;
	onSelect: () => void;
}

/** Renders a group of command options with a heading. */
function CommandGroupSection({ heading, options }: { heading: string; options: CommandOption[] }) {
	return (
		<CommandGroup heading={heading}>
			{options.map((option) => (
				<CommandItem key={option.label} onSelect={option.onSelect}>
					{option.icon}
					<span>{option.label}</span>
				</CommandItem>
			))}
		</CommandGroup>
	);
}

/**
 * Props for CommandPalette component.
 */
interface CommandPaletteProps {
	canAccess: (requiredRole: undefined | UserRole) => boolean;
	onNavigate: (path: string) => void;
}

/**
 * Ctrl+K / Cmd+K command palette for quick page navigation and actions.
 *
 * Built on top of cmdk dialog. Provides searchable lists of
 * application pages and quick actions (theme toggle, sidebar toggle).
 *
 * Page routes are sourced from the centralized navConfig to avoid
 * duplication. Sub-routes (settings tabs, profile tabs) are maintained
 * separately as they are unique to the command palette.
 */
function CommandPalette({ canAccess, onNavigate }: CommandPaletteProps) {
	const isOpen = useCommandStore((s) => s.isOpen);
	const close = useCommandStore((s) => s.close);
	const toggleSidebar = useSidebarStore((s) => s.toggle);
	const collapsed = useSidebarStore((s) => s.collapsed);
	const themeMode = useThemeStore((s) => s.mode);
	const setThemeMode = useThemeStore((s) => s.setMode);

	function navigateTo(path: string) {
		onNavigate(path);
		close();
	}

	function toggleTheme() {
		startTransition(() => {
			const nextMode: Record<string, 'dark' | 'light' | 'system'> = {
				dark: 'light',
				light: 'system',
				system: 'dark',
			};
			const mode = nextMode[themeMode] ?? 'system';
			setThemeMode(mode);
			void updateUserUiSettings({ theme: mode });
			close();
		});
	}

	function handleToggleSidebar() {
		startTransition(() => {
			toggleSidebar();
			close();
		});
	}

	const navPages: CommandOption[] = navItems
		.filter((item) => canAccess(item.minRole))
		.map((item) => ({
			icon: resizeIcon(item.icon),
			label: item.label,
			onSelect: () => navigateTo(item.to),
		}));

	const subPages: CommandOption[] = SUB_ROUTES.filter((route) => canAccess(route.minRole)).map(
		(route) => ({
			icon: route.icon,
			label: route.label,
			onSelect: () => navigateTo(route.path),
		})
	);

	const pages = [...navPages, ...subPages];

	const actions: CommandOption[] = [
		{
			icon:
				themeMode === 'dark' ? (
					<Sun aria-hidden="true" className="mr-2 size-4" />
				) : (
					<Moon aria-hidden="true" className="mr-2 size-4" />
				),
			label: `Toggle theme (current: ${themeMode})`,
			onSelect: toggleTheme,
		},
		{
			icon: collapsed ? (
				<PanelLeftOpen aria-hidden="true" className="mr-2 size-4" />
			) : (
				<PanelLeftClose aria-hidden="true" className="mr-2 size-4" />
			),
			label: `${collapsed ? 'Expand' : 'Collapse'} sidebar`,
			onSelect: handleToggleSidebar,
		},
	];

	return (
		<CommandDialog onOpenChange={(open) => !open && close()} open={isOpen}>
			<CommandInput aria-label="Search commands" placeholder="Type a command or search…" />
			<CommandList>
				<CommandEmpty>No results found.</CommandEmpty>
				<CommandGroupSection heading="Pages" options={pages} />
				<CommandSeparator />
				<CommandGroupSection heading="Actions" options={actions} />
			</CommandList>
		</CommandDialog>
	);
}

export { CommandPalette };
