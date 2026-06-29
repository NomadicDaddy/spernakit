import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';

import type { UserRole } from '@/types/roles';

import { PageHeader } from '@/components/shared/PageHeader';
import { cn } from '@/lib/utils';

interface TabItem {
	label: string;
	minRole?: UserRole;
	to: string;
}

interface TabLayoutProps {
	description: string;
	headerAction?: ReactNode;
	onTabClick?: (tab: TabItem) => void;
	tabs: TabItem[];
	title: string;
}

function TabLayout({ description, headerAction, onTabClick, tabs, title }: TabLayoutProps) {
	const location = useLocation();
	const navRef = useRef<HTMLElement>(null);
	const tabRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);

	const updateScrollIndicators = () => {
		const nav = navRef.current;
		if (!nav) return;
		const { clientWidth, scrollLeft, scrollWidth } = nav;
		// Small threshold to avoid sub-pixel issues
		const threshold = 2;
		setCanScrollLeft(scrollLeft > threshold);
		setCanScrollRight(scrollLeft + clientWidth < scrollWidth - threshold);
	};

	// Scroll active tab into view on mount and route change
	useEffect(() => {
		const activeTab = tabRefs.current.get(location.pathname);
		if (activeTab) {
			activeTab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
		}
		// Also update scroll indicators after route change
		requestAnimationFrame(updateScrollIndicators);
	}, [location.pathname]);

	// Update indicators on mount and resize
	useEffect(() => {
		updateScrollIndicators();
		const nav = navRef.current;
		if (!nav) return;

		const observer = new ResizeObserver(() => {
			updateScrollIndicators();
		});
		observer.observe(nav);
		return () => observer.disconnect();
	}, []);

	return (
		<div className="space-y-6 p-6">
			<PageHeader className="pb-0 md:border-b-0" description={description} title={title}>
				{headerAction}
			</PageHeader>

			<div className="relative border-b">
				{/* Trailing gradient fade — shows when there is content to scroll right */}
				{canScrollRight && (
					<div className="from-background pointer-events-none absolute top-0 right-0 z-10 h-full w-12 bg-gradient-to-l to-transparent" />
				)}
				{/* Leading gradient fade — shows when scrolled past start */}
				{canScrollLeft && (
					<div className="from-background pointer-events-none absolute top-0 left-0 z-10 h-full w-12 bg-gradient-to-r to-transparent" />
				)}
				<nav
					className="-mb-px flex scrollbar-none gap-4 overflow-x-auto"
					onScroll={updateScrollIndicators}
					ref={navRef}>
					{tabs.map((tab) => (
						<NavLink
							className={cn(
								'focus-visible:ring-ring rounded-sm border-b-2 px-1 pb-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
								location.pathname === tab.to
									? 'border-primary text-foreground'
									: 'text-muted-foreground hover:text-foreground border-transparent'
							)}
							key={tab.to}
							onClick={onTabClick ? () => onTabClick(tab) : undefined}
							ref={(el) => {
								if (el) {
									tabRefs.current.set(tab.to, el);
								} else {
									tabRefs.current.delete(tab.to);
								}
							}}
							to={tab.to}>
							{tab.label}
						</NavLink>
					))}
				</nav>
			</div>

			<Outlet />
		</div>
	);
}

export { TabLayout };
export type { TabItem };
