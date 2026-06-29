import type { ReactNode } from 'react';

import { Menu } from 'lucide-react';
import { NavLink } from 'react-router-dom';

import type { NavItem } from '@/components/layout/navConfig';

import { Button } from '@/components/ui/button';
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

type ShellNavBaseProps = {
	navItems: NavItem[];
	renderLabel: (item: NavItem, index: number) => ReactNode;
	sheetTitle: string;
};

function ShellNavBase({ navItems, renderLabel, sheetTitle }: ShellNavBaseProps) {
	return (
		<>
			{/* Desktop nav links */}
			<nav className="hidden items-center gap-1 md:flex">
				{navItems.map((item, index) => (
					<NavLink
						className={({ isActive }) =>
							cn(
								'px-2 py-1 text-sm transition-colors',
								isActive
									? 'text-primary font-bold'
									: 'text-muted-foreground hover:text-foreground'
							)
						}
						key={item.to}
						to={item.to}>
						{renderLabel(item, index)}
					</NavLink>
				))}
			</nav>

			{/* Mobile: hamburger sheet */}
			<Sheet>
				<SheetTrigger asChild>
					<Button className="md:hidden" size="icon" variant="ghost">
						<Menu aria-hidden="true" className="size-5" />
						<span className="sr-only">Menu</span>
					</Button>
				</SheetTrigger>
				<SheetContent className="w-64" side="left">
					<SheetHeader>
						<SheetTitle className="text-primary text-sm">{sheetTitle}</SheetTitle>
						<SheetDescription className="sr-only">Navigation menu</SheetDescription>
					</SheetHeader>
					<nav className="mt-4 flex flex-col gap-1">
						{navItems.map((item, index) => (
							<NavLink
								className={({ isActive }) =>
									cn(
										'px-3 py-2 text-sm transition-colors',
										isActive
											? 'text-primary font-bold'
											: 'text-muted-foreground hover:text-foreground'
									)
								}
								key={item.to}
								to={item.to}>
								{renderLabel(item, index)}
							</NavLink>
						))}
					</nav>
				</SheetContent>
			</Sheet>
		</>
	);
}

export { ShellNavBase };
