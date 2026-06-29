import { NavLink } from 'react-router-dom';

import { HeaderBarActions } from '@/components/layout/HeaderBarActions';
import { MobileNav } from '@/components/layout/MobileNav';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { useLayoutActions } from '@/hooks/layout/useLayoutActions';
import { useAppFeatures } from '@/hooks/useAppFeatures';
import { useAuthorization } from '@/hooks/useAuthorization';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/routes';
import { useLayoutStore } from '@/stores/layoutStore';

import { getVisibleNavItems, navItems } from './navConfig';

/**
 * Horizontal top-bar navigation layout.
 *
 * Contains app name, horizontal nav links, workspace switcher,
 * notifications, theme toggle, and user menu.
 * Nav links collapse behind the mobile hamburger drawer below `md`.
 */
function TopBar() {
	const { hasMinRole } = useAuthorization();
	const containerWidth = useLayoutStore((s) => s.containerWidth);
	const layoutActions = useLayoutActions();
	const { features: appFeatures } = useAppFeatures();
	// Fail-closed: show only non-feature-gated items when features are unavailable
	const visibleNavItems = appFeatures
		? getVisibleNavItems(hasMinRole, appFeatures)
		: navItems.filter(
				(item) => !item.featureFlag && (!item.minRole || hasMinRole(item.minRole))
			);

	return (
		<header className="bg-background sticky top-0 z-40 border-b">
			<div
				className={cn(
					'flex h-14 items-center justify-between px-4',
					containerWidth === 'centered' && 'mx-auto w-full max-w-7xl'
				)}>
				{/* Left: hamburger (mobile) + app name + nav links */}
				<div className="flex min-w-0 items-center gap-1">
					<MobileNav />
					<span
						className="hidden text-lg font-semibold tracking-tight md:inline"
						translate="no">
						{__APP_NAME__}
					</span>
					<nav className="ml-4 hidden min-w-0 items-center gap-1 overflow-x-auto md:flex">
						{visibleNavItems.map((item) => (
							<NavLink
								className={({ isActive }) =>
									cn(
										'flex items-center gap-2 rounded-md px-3 py-(--density-padding-y) text-sm font-medium text-nowrap transition-colors',
										'hover:bg-accent hover:text-accent-foreground',
										isActive
											? 'bg-accent text-accent-foreground'
											: 'text-muted-foreground'
									)
								}
								key={item.to}
								onFocus={() => preloadRoute(item.to)}
								onMouseEnter={() => preloadRoute(item.to)}
								to={item.to}>
								{item.icon}
								<span>{item.label}</span>
							</NavLink>
						))}
					</nav>
				</div>

				{/* Right: workspace, bug report, notifications, user */}
				<div className="flex shrink-0 items-center gap-2">
					<WorkspaceSwitcher />
					<HeaderBarActions layoutActions={layoutActions} />
				</div>
			</div>
		</header>
	);
}

export { TopBar };
