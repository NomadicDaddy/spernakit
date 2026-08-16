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

	/*
	 * Writes the rail's own `scrollLeft`. It used to call `activeTab.scrollIntoView({ block:
	 * 'nearest', inline: 'center' })`, and `scrollIntoView` cannot be scoped: it scrolls EVERY
	 * scrollable ancestor until the element is visible in all of them, and `block`/`inline` choose
	 * the alignment within each one rather than which ones take part. `main` is one of those
	 * ancestors on every page, so arriving at /profile/security scrolled the page title out from
	 * under the user — main.scrollTop 66 at 390 and 110 at 360, with the h1 behind the fixed header
	 * before they had touched anything. The only way to move one container is to compute the offset
	 * against it and write it, which is what this does.
	 *
	 * The early return is the other half. `nearest` still moves when a tab is clipped by a fraction
	 * of a pixel, and the common case — the active tab already fully inside the rail — needs no
	 * scroll at all. Bringing a genuinely off-screen tab into view is kept: the rail overflows 4.8x
	 * at mobile, so that part earns its place.
	 */
	const scrollActiveTabIntoView = useCallback(
		(behavior: ScrollBehavior) => {
			const nav = navRef.current;
			const activeTab = tabRefs.current.get(location.pathname);
			if (!nav || !activeTab) return;

			const navRect = nav.getBoundingClientRect();
			const tabRect = activeTab.getBoundingClientRect();
			if (tabRect.left >= navRect.left && tabRect.right <= navRect.right) return;

			// Rect-relative rather than `offsetLeft`, which is measured against the nearest
			// positioned ancestor — here the wrapper that carries the gradient fades, not the rail.
			const offsetWithinRail = tabRect.left - navRect.left + nav.scrollLeft;
			nav.scrollTo({
				behavior,
				left: offsetWithinRail - (nav.clientWidth - tabRect.width) / 2,
			});
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
			 * The chevrons are flex siblings of the scrolling nav, not absolutely positioned over
			 * it, so they can never cover a tab label. Both sit at the trailing end as a pager
			 * pair: a leading chevron is a 36px indent applied to the rail alone, and at 1440 —
			 * the only desktop width where this rail overflows — it put the first tab at x=300
			 * while the h1, the toolbar and every card below stayed at x=264. Nothing else on the
			 * page has a control in that gutter, so the rail was the one row that failed to line
			 * up. They appear together as soon as the rail overflows, and the unusable one is
			 * disabled rather than unmounted — mounting one at a time would resize the rail on
			 * every scroll.
			 *
			 * Below `md` they are not rendered at all. Touch scrolling is the native gesture for
			 * this control on a phone, and the pair cost ~72px of a 334px row before a single tab
			 * was drawn — more, on /profile/security, than the 30px of overflow they existed to
			 * manage.
			 */}
			<div className="flex items-center border-b">
				<div className="relative min-w-0 flex-1">
					{/*
					 * Trailing and leading gradient fades — each shows when there is content to
					 * scroll that way. `w-4` below `md`: at 232px of usable rail two 48px
					 * gradients covered 41% of it, and a fade that reaches the middle of the rail
					 * stops reading as an edge treatment and starts reading as fog. 16px is what
					 * it took to get three consecutive tab labels fully clear of both gradients at
					 * 360x800 as well as 390x844 — at 24px the trailing edge still crossed the
					 * last 7px of "Notifications" on the narrower phone.
					 */}
					{canScrollRight && (
						<div className="pointer-events-none absolute top-0 right-0 z-10 h-full w-4 bg-gradient-to-l from-background to-transparent md:w-12" />
					)}
					{canScrollLeft && (
						<div className="pointer-events-none absolute top-0 left-0 z-10 h-full w-4 bg-gradient-to-r from-background to-transparent md:w-12" />
					)}
					<nav
						aria-label={`${title} sections`}
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
					// `mb-px` clears the row's own `border-b`: the 32px circles bottomed out at
					// y=205 against a divider at y=206 and read as resting on the rule.
					<div className="hidden shrink-0 items-center gap-1 pl-2 md:flex">
						<Button
							aria-label="Scroll section tabs left"
							className="mb-px size-8 rounded-full"
							disabled={!canScrollLeft}
							onClick={() => scrollTabs('left')}
							size="icon"
							type="button"
							variant="outline">
							<ChevronLeft aria-hidden="true" className="size-4" />
						</Button>
						<Button
							aria-label="Scroll section tabs right"
							className="mb-px size-8 rounded-full"
							disabled={!canScrollRight}
							onClick={() => scrollTabs('right')}
							size="icon"
							type="button"
							variant="outline">
							<ChevronRight aria-hidden="true" className="size-4" />
						</Button>
					</div>
				)}
			</div>

			<Outlet />
		</div>
	);
}

export { TabLayout };
export type { TabItem };
