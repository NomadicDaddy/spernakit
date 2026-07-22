import { Menu, Monitor, Moon, Settings2, Sun, User } from 'lucide-react';
import { startTransition, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import type { ThemeMode } from '@/stores/themeStore';

import { updateUserUiSettings } from '@/api/userSettings';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';
import { useAppFeatures } from '@/hooks/useAppFeatures';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useTheme } from '@/hooks/useTheme';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/routes';
import { useAuthStore } from '@/stores/authStore';

import { getVisibleNavItems, navItems } from './navConfig';

const themeModes: { icon: React.ReactNode; label: string; value: ThemeMode }[] = [
	{ icon: <Sun aria-hidden="true" className="size-4" />, label: 'Light', value: 'light' },
	{ icon: <Moon aria-hidden="true" className="size-4" />, label: 'Dark', value: 'dark' },
	{ icon: <Monitor aria-hidden="true" className="size-4" />, label: 'System', value: 'system' },
];

/**
 * Sheet-based mobile navigation drawer, triggered by a hamburger icon.
 *
 * Visible only below the `md` breakpoint. Mirrors the same nav links
 * as desktop {@link Sidebar} and auto-closes on navigation.
 * Includes user section with account link and theme toggle at the bottom.
 */
function MobileNav() {
	const [open, setOpen] = useState(false);
	const location = useLocation();
	const { hasMinRole } = useAuthorization();
	const { features: appFeatures } = useAppFeatures();
	const user = useAuthStore((s) => s.user);
	const { mode, setMode } = useTheme();

	// Fail-closed: show only non-feature-gated items when features are unavailable
	const visibleNavItems = appFeatures
		? getVisibleNavItems(hasMinRole, appFeatures)
		: navItems.filter(
				(item) => !item.featureFlag && (!item.minRole || hasMinRole(item.minRole))
			);

	// Auto-close menu when route changes (derived state during render pattern)
	const [prevPathname, setPrevPathname] = useState(location.pathname);
	if (location.pathname !== prevPathname) {
		setPrevPathname(location.pathname);
		setOpen(false);
	}

	return (
		<Sheet onOpenChange={setOpen} open={open}>
			<SheetTrigger asChild>
				<Button
					aria-label="Open navigation menu"
					className="md:hidden"
					size="icon"
					variant="ghost">
					<Menu className="size-5" />
				</Button>
			</SheetTrigger>
			<SheetContent className="flex w-64 flex-col p-0" side="left">
				<SheetHeader className="border-b px-4 py-3">
					<SheetTitle className="text-lg font-semibold tracking-tight" translate="no">
						{__APP_NAME__}
					</SheetTitle>
					<SheetDescription className="sr-only">Navigation menu</SheetDescription>
				</SheetHeader>
				<nav
					aria-label="Mobile navigation"
					className="flex-1 space-y-1 overflow-y-auto p-2">
					{visibleNavItems.map((item) => (
						<NavLink
							className={cn(
								'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none',
								'hover:bg-accent hover:text-accent-foreground',
								'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2',
								location.pathname.startsWith(item.to)
									? 'bg-accent text-accent-foreground'
									: 'text-muted-foreground'
							)}
							key={item.to}
							onClick={() => setOpen(false)}
							onFocus={() => preloadRoute(item.to)}
							onMouseEnter={() => preloadRoute(item.to)}
							to={item.to}>
							{item.icon}
							<span>{item.label}</span>
						</NavLink>
					))}
				</nav>

				{/* User section */}
				<div className="mt-auto border-t">
					<div className="space-y-1 p-2">
						<NavLink
							className={cn(
								'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none',
								'hover:bg-accent hover:text-accent-foreground',
								'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2',
								location.pathname.startsWith('/profile')
									? 'bg-accent text-accent-foreground'
									: 'text-muted-foreground'
							)}
							onClick={() => setOpen(false)}
							to="/profile/personal">
							<User aria-hidden="true" className="size-5" />
							<span>Account</span>
						</NavLink>
						<NavLink
							className={cn(
								'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none',
								'hover:bg-accent hover:text-accent-foreground',
								'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2',
								'text-muted-foreground'
							)}
							onClick={() => setOpen(false)}
							to="/profile/preferences">
							<Settings2 aria-hidden="true" className="size-5" />
							<span>Preferences</span>
						</NavLink>
					</div>

					<Separator />

					{/* Theme selector */}
					<div className="flex items-center justify-between px-4 py-3">
						<span className="text-muted-foreground text-xs font-medium">Theme</span>
						<div className="flex gap-1">
							{themeModes.map((t) => (
								<Button
									aria-label={`${t.label} theme`}
									className={cn(mode === t.value && 'bg-accent')}
									key={t.value}
									onClick={() => {
										startTransition(() => {
											setMode(t.value);
											void updateUserUiSettings({ theme: t.value });
										});
									}}
									size="icon"
									variant="ghost">
									{t.icon}
								</Button>
							))}
						</div>
					</div>

					{/* User info */}
					{user && (
						<div className="border-t px-4 py-3">
							<p className="truncate text-sm font-medium">{user.username}</p>
							<p className="text-muted-foreground truncate text-xs">{user.email}</p>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

export { MobileNav };
