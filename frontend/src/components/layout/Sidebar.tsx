import { ChevronLeft, ChevronRight } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { WorkspaceSwitcher } from '@/components/workspace/WorkspaceSwitcher';
import { useAppFeatures } from '@/hooks/useAppFeatures';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useWorkspace } from '@/hooks/useWorkspace';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/routes';
import { useSidebarStore } from '@/stores/sidebarStore';

import { getVisibleNavItems, navItems } from './navConfig';

/**
 * Collapsible sidebar navigation rendered on `md+` viewports.
 *
 * Contains the workspace switcher, primary nav links, and a collapse toggle.
 * In collapsed mode nav links show icon-only with tooltips.
 * When the active workspace has a branding logo, it replaces the app name.
 */
function Sidebar() {
	const collapsed = useSidebarStore((s) => s.collapsed);
	const toggle = useSidebarStore((s) => s.toggle);
	const { hasMinRole } = useAuthorization();
	const { features: appFeatures } = useAppFeatures();
	const { activeWorkspace } = useWorkspace();

	const brandingLogoFileId = activeWorkspace?.settings?.branding?.logoFileId;

	// Fail-closed: show only non-feature-gated items when features are unavailable
	const visibleNavItems = appFeatures
		? getVisibleNavItems(hasMinRole, appFeatures)
		: navItems.filter(
				(item) => !item.featureFlag && (!item.minRole || hasMinRole(item.minRole))
			);

	return (
		<aside
			aria-label="Main navigation"
			className="bg-background flex h-full w-full flex-col overflow-hidden border-r"
			role="navigation">
			{/* Logo / App Name */}
			<div className="flex h-14 items-center border-b px-4">
				{brandingLogoFileId ? (
					<img
						alt={`${activeWorkspace?.name ?? 'Workspace'} logo`}
						className={cn('h-8 object-contain', collapsed ? 'mx-auto' : '')}
						height={32}
						src={`/api/v1/files/${brandingLogoFileId}`}
						width={32}
					/>
				) : !collapsed ? (
					<span
						className="font-display bg-clip-text text-xl font-semibold tracking-tight text-transparent"
						style={{ backgroundImage: 'var(--brand-gradient)' }}
						translate="no">
						{__APP_NAME__}
					</span>
				) : (
					<span
						className="font-display mx-auto bg-clip-text text-xl font-bold text-transparent"
						style={{ backgroundImage: 'var(--brand-gradient)' }}
						translate="no">
						{__APP_NAME__[0]}
					</span>
				)}
			</div>

			{/* Workspace Switcher */}
			<div className="border-b p-2">
				<WorkspaceSwitcher />
			</div>

			{/* Navigation */}
			<nav className="flex-1 space-y-1 overflow-y-auto p-2">
				{visibleNavItems.map((item) => {
					const link = (
						<NavLink
							aria-label={collapsed ? item.label : undefined}
							className={({ isActive }) =>
								cn(
									'flex items-center gap-3 rounded-md px-3 py-(--density-padding-y) text-sm font-medium transition-colors outline-none',
									'hover:bg-accent hover:text-accent-foreground',
									'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2',
									isActive
										? 'bg-accent text-accent-foreground'
										: 'text-muted-foreground',
									collapsed && 'justify-center px-2'
								)
							}
							key={item.to}
							onFocus={() => preloadRoute(item.to)}
							onMouseEnter={() => preloadRoute(item.to)}
							to={item.to}>
							{item.icon}
							{!collapsed && <span>{item.label}</span>}
						</NavLink>
					);

					if (collapsed) {
						return (
							<Tooltip key={item.to}>
								<TooltipTrigger asChild>{link}</TooltipTrigger>
								<TooltipContent side="right">{item.label}</TooltipContent>
							</Tooltip>
						);
					}

					return link;
				})}
			</nav>

			<Separator />

			{/* Version info (when expanded) */}
			{!collapsed && (
				<div className="px-4 py-2">
					<span className="text-muted-foreground text-xs">v{__APP_VERSION__}</span>
				</div>
			)}

			{/* Collapse toggle */}
			<div className="p-2">
				<Button
					aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					className="w-full"
					onClick={toggle}
					size="sm"
					variant="ghost">
					{collapsed ? (
						<ChevronRight aria-hidden="true" className="size-4" />
					) : (
						<>
							<ChevronLeft aria-hidden="true" className="size-4" />
							<span className="ml-2">Collapse</span>
						</>
					)}
				</Button>
			</div>
		</aside>
	);
}

export { Sidebar };
