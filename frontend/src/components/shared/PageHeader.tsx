import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { ChevronRight } from 'lucide-react';
import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import { cn } from '@/lib/utils';

/** A single breadcrumb trail entry. Provide `to` to render a navigable link. */
interface Breadcrumb {
	label: string;
	to?: string;
}

interface PageHeaderProps {
	/** Optional breadcrumb trail rendered above the title. The final entry is styled as the current page. */
	breadcrumbs?: Breadcrumb[];
	children?: ReactNode;
	className?: string;
	description?: ReactNode;
	eyebrow?: string;
	icon?: LucideIcon;
	title: ReactNode;
}

function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
	return (
		<nav aria-label="Breadcrumb" className="mb-1">
			<ol className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
				{items.map((item, i) => {
					const isLast = i === items.length - 1;
					return (
						<Fragment key={`${item.label}-${i}`}>
							<li>
								{item.to && !isLast ? (
									<Link
										className="hover:text-foreground transition-colors"
										to={item.to}>
										{item.label}
									</Link>
								) : (
									<span
										aria-current={isLast ? 'page' : undefined}
										className={cn(isLast && 'text-foreground font-medium')}>
										{item.label}
									</span>
								)}
							</li>
							{!isLast && (
								<li aria-hidden="true">
									<ChevronRight className="size-3.5" />
								</li>
							)}
						</Fragment>
					);
				})}
			</ol>
		</nav>
	);
}

/**
 * Standard page header primitive. Renders an optional eyebrow, a display-font
 * title, an optional lead description, and a trailing action slot (children).
 * Used at the top of most pages in the app.
 */
function PageHeader({
	breadcrumbs,
	children,
	className,
	description,
	eyebrow,
	icon: Icon,
	title,
}: PageHeaderProps) {
	return (
		<div className={cn('border-border/60 pb-6 md:border-b', className)}>
			{breadcrumbs && breadcrumbs.length > 0 && <Breadcrumbs items={breadcrumbs} />}
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="flex min-w-0 items-start gap-3">
					{Icon && (
						<div className="bg-muted/60 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg">
							<Icon aria-hidden="true" className="size-5" />
						</div>
					)}
					<div className="min-w-0 flex-1 space-y-1">
						{eyebrow && <p className="text-eyebrow">{eyebrow}</p>}
						<h1 className="text-display text-balance">{title}</h1>
						{description && <p className="text-lead">{description}</p>}
					</div>
				</div>
				{children && (
					<div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
				)}
			</div>
		</div>
	);
}

export { PageHeader };
export type { Breadcrumb };
