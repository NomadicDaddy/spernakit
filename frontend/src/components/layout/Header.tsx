import { HeaderBarActions } from '@/components/layout/HeaderBarActions';
import { MobileNav } from '@/components/layout/MobileNav';
import { useLayoutActions } from '@/hooks/layout/useLayoutActions';

/**
 * Header component with navigation, notifications, and user menu.
 */
function Header() {
	const layoutActions = useLayoutActions();

	return (
		<header className="bg-background flex h-12 items-center justify-between border-b px-2 md:h-14 md:px-4">
			{/* Left: Mobile hamburger + breadcrumbs */}
			<div className="flex items-center gap-2">
				<MobileNav />
				<span className="text-muted-foreground hidden text-sm md:inline">
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
