import { HeaderBarActions } from '@/components/layout/HeaderBarActions';
import { MobileNav } from '@/components/layout/MobileNav';
import { useLayoutActions } from '@/hooks/layout/useLayoutActions';

/**
 * Header component with navigation, notifications, and user menu.
 */
function Header() {
	const layoutActions = useLayoutActions();

	return (
		<header className="flex h-12 items-center justify-between border-b bg-background px-2 md:h-14 md:px-4">
			{/* Left: Mobile hamburger + breadcrumbs */}
			<div className="flex items-center gap-2">
				<MobileNav />
				<span className="hidden text-sm text-muted-foreground md:inline">
					{/* Breadcrumb content will be added by individual pages */}
				</span>
			</div>

			{/* Right section */}
			<div className="flex items-center gap-2">
				<HeaderBarActions layoutActions={layoutActions} />
			</div>
		</header>
	);
}

export { Header };
