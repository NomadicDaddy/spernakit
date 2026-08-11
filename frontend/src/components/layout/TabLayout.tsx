import { ChevronLeft, ChevronRight } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';

import type { Breadcrumb } from '@/components/shared/PageHeader';
import type { UserRole } from '@/types/roles';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface TabItem {
	label: string;
	minRole?: UserRole;
	to: string;
}

interface TabLayoutProps {
	/** Breadcrumb trail for a tabbed page reached from somewhere else — a workspace, a record. */
	breadcrumbs?: Breadcrumb[];
	description: string;
	headerAction?: ReactNode;
	onTabClick?: (tab: TabItem) => void;
	tabs: TabItem[];
	title: string;
}

function TabLayout({
	breadcrumbs,
	description,
	headerAction,
	onTabClick,
	tabs,
	title,
}: TabLayoutProps) {
	const location = useLocation();
	const navRef = useRef<HTMLElement>(null);
	const tabRefs = useRef<Map<string, HTMLAnchorElement>>(new Map());
	const [canScrollLeft, setCanScrollLeft] = useState(false);
	const [canScrollRight, setCanScrollRight] = useState(false);
	const [isOverflowing, setIsOverflowing] = useState(false);

	const updateScrollIndicators = () => {
		const nav = navRef.current;
		if (!nav) return;
		const { clientWidth, scrollLeft, scrollWidth } = nav;
		// Small threshold to avoid sub-pixel issues
		const threshold = 2;
		setIsOverflowing(scrollWidth > clientWidth + threshold);
		setCanScrollLeft(scrollLeft > threshold);
		setCanScrollRight(scrollLeft + clientWidth < scrollWidth - threshold);
	};

	const scrollTabs = (direction: 'left' | 'right') => {
		const nav = navRef.current;
		if (!nav) return;
		nav.scrollBy({
			behavior: 'smooth',
			left: (direction === 'left' ? -1 : 1) * Math.max(240, nav.clientWidth * 0.75),
		});
	};

	const scrollActiveTabIntoView = useCallback(
		(behavior: ScrollBehavior) => {
			const activeTab = tabRefs.current.get(location.pathname);
			activeTab?.scrollIntoView({ behavior, block: 'nearest', inline: 'center' });
		},
		[location.pathname],
	);

	// Scroll active tab into view on mount and route change
	useEffect(() => {
		scrollActiveTabIntoView('smooth');
		// Also update scroll indicators after route change
		requestAnimationFrame(updateScrollIndicators);
	}, [location.pathname, scrollActiveTabIntoView]);

	// Update indicators on mount and resize
	useEffect(() => {
		updateScrollIndicators();
		const nav = navRef.current;
		if (!nav) return;

		const observer = new ResizeObserver(() => {
			scrollActiveTabIntoView('auto');
			updateScrollIndicators();
		});
		observer.observe(nav);
		return () => observer.disconnect();
	}, [scrollActiveTabIntoView]);

	return (
		<div className="space-y-6 p-6">
			<PageHeader
				className="pb-0 md:border-b-0"
				description={description}
				title={title}
				{...(breadcrumbs ? { breadcrumbs } : {})}>
				{headerAction}
			</PageHeader>

			{/*
			 * The chevrons are flex siblings of the scrolling nav, not absolutely positioned
			 * over it, so they can never cover the first or last tab label. They appear
			 * together as soon as the rail overflows and the unusable one is disabled rather
			 * than unmounted — mounting one at a time would resize the rail on every scroll.
			 */}
			<div className="flex items-center border-b">
				{isOverflowing && (
					<Button
						aria-label="Scroll section tabs left"
						className="mr-1 size-8 shrink-0 rounded-full"
						disabled={!canScrollLeft}
						onClick={() => scrollTabs('left')}
						size="icon"
						type="button"
						variant="outline">
						<ChevronLeft aria-hidden="true" className="size-4" />
					</Button>
				)}
				<div className="relative min-w-0 flex-1">
					{/* Trailing gradient fade — shows when there is content to scroll right */}
					{canScrollRight && (
						<div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-12 bg-gradient-to-l from-background to-transparent" />
					)}
					{/* Leading gradient fade — shows when scrolled past start */}
					{canScrollLeft && (
						<div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-12 bg-gradient-to-r from-background to-transparent" />
					)}
					<nav
						className="-mb-px flex scrollbar-none gap-4 overflow-x-auto"
						onScroll={updateScrollIndicators}
						ref={navRef}>
						{tabs.map((tab) => (
							<NavLink
								className={cn(
									'rounded-sm border-b-2 px-1 pb-3 text-sm font-medium whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none',
									location.pathname === tab.to
										? 'border-primary text-foreground'
										: 'border-transparent text-muted-foreground hover:text-foreground',
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
				{isOverflowing && (
					<Button
						aria-label="Scroll section tabs right"
						className="ml-1 size-8 shrink-0 rounded-full"
						disabled={!canScrollRight}
						onClick={() => scrollTabs('right')}
						size="icon"
						type="button"
						variant="outline">
						<ChevronRight aria-hidden="true" className="size-4" />
					</Button>
				)}
			</div>

			<Outlet />
		</div>
	);
}

export { TabLayout };
export type { TabItem };
