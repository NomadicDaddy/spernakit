import { Menu, Monitor, Moon, Settings2, Sun, User } from 'lucide-react';
import { startTransition, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router';

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

import { getVisibleNavItems, isNavItemActive, navItems } from './navConfig';

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
				(item) => !item.featureFlag && (!item.minRole || hasMinRole(item.minRole)),
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
								'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
								isNavItemActive(location.pathname, item.to)
									? 'bg-accent text-accent-foreground'
									: 'text-muted-foreground',
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
					{/*
					 * `Link` rather than `NavLink` for these two, and `aria-current` written by hand.
					 *
					 * Both rows point into the same tabbed section — `/profile/preferences` is one of
					 * ProfileLayout's four tabs, alongside personal, security and api-keys — so the
					 * row that should look current is not always the row whose `to` the URL equals.
					 * NavLink does not allow that: it decides `aria-current` from its own match and
					 * a passed `aria-current` only changes the value it uses when it has already
					 * decided the link is active. The result was two rows answering "you are here"
					 * differently — on /profile/preferences the highlight sat on Account while
					 * `aria-current="page"` sat on Preferences, and on /profile/security the
					 * highlight sat on Account with no row marked current at all.
					 *
					 * One predicate now drives both the styling and the announcement, so exactly one
					 * row is current on every /profile route and it is the same row in both channels.
					 * Preferences claims its own tab; Account holds the rest of the section, which is
					 * the section-level `aria-current="page"` the main nav rows already use for
					 * /settings and its children.
					 */}
					<div className="space-y-1 p-2">
						{[
							{
								icon: <User aria-hidden="true" className="size-5" />,
								isCurrent:
									isNavItemActive(location.pathname, '/profile') &&
									!isNavItemActive(location.pathname, '/profile/preferences'),
								label: 'Account',
								to: '/profile/personal',
							},
							{
								icon: <Settings2 aria-hidden="true" className="size-5" />,
								isCurrent: isNavItemActive(
									location.pathname,
									'/profile/preferences',
								),
								label: 'Preferences',
								to: '/profile/preferences',
							},
						].map((row) => (
							<Link
								aria-current={row.isCurrent ? 'page' : undefined}
								className={cn(
									'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none',
									'hover:bg-accent hover:text-accent-foreground',
									'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
									row.isCurrent
										? 'bg-accent text-accent-foreground'
										: 'text-muted-foreground',
								)}
								key={row.to}
								onClick={() => setOpen(false)}
								to={row.to}>
								{row.icon}
								<span>{row.label}</span>
							</Link>
						))}
					</div>

					<Separator />

					{/* Theme selector */}
					<div className="flex items-center justify-between px-4 py-3">
						<span className="text-xs font-medium text-muted-foreground">Theme</span>
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
							<p className="truncate text-xs text-muted-foreground">{user.email}</p>
						</div>
					)}
				</div>
			</SheetContent>
		</Sheet>
	);
}

export { MobileNav };
