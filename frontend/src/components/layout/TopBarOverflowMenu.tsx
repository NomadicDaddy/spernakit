import { MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router';

import type { NavItem } from '@/components/layout/navConfig';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { preloadRoute } from '@/routes';

function TopBarOverflowMenu({ isActive, items }: { isActive: boolean; items: NavItem[] }) {
	const [isOpen, setIsOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);
	const menuRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!isOpen) return;
		function handlePointerDown(event: PointerEvent) {
			if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
		}
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === 'Escape') setIsOpen(false);
		}
		document.addEventListener('pointerdown', handlePointerDown);
		document.addEventListener('keydown', handleKeyDown);
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown);
			document.removeEventListener('keydown', handleKeyDown);
		};
	}, [isOpen]);

	return (
		<div className="relative" ref={containerRef}>
			<Button
				aria-expanded={isOpen}
				aria-haspopup="menu"
				aria-label="More navigation destinations"
				className={cn(isActive && 'bg-accent text-accent-foreground')}
				onClick={() => setIsOpen((current) => !current)}
				onKeyDown={(event) => {
					if (event.key === 'ArrowDown') {
						event.preventDefault();
						setIsOpen(true);
						requestAnimationFrame(() => {
							menuRef.current
								?.querySelector<HTMLElement>('[role="menuitem"]')
								?.focus();
						});
					}
				}}
				size="sm"
				type="button"
				variant="ghost">
				<MoreHorizontal aria-hidden="true" className="size-5" />
				<span>More</span>
			</Button>
			{isOpen && (
				<div
					aria-label="More navigation destinations"
					className="absolute top-full left-0 z-50 mt-1 min-w-52 rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
					ref={menuRef}
					role="menu">
					{items.map((item) => (
						<NavLink
							className={({ isActive: itemIsActive }) =>
								cn(
									'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
									itemIsActive && 'bg-accent text-accent-foreground',
								)
							}
							key={item.to}
							onClick={() => setIsOpen(false)}
							onFocus={() => preloadRoute(item.to)}
							onMouseEnter={() => preloadRoute(item.to)}
							role="menuitem"
							to={item.to}>
							{item.icon}
							<span>{item.label}</span>
						</NavLink>
					))}
				</div>
			)}
		</div>
	);
}

export { TopBarOverflowMenu };
