import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
	action?: ReactNode;
	className?: string;
	description?: ReactNode;
	/**
	 * Outline level for the title. `h2` suits an empty state that stands in for a whole page
	 * region. Pass a lower level when the empty state sits *inside* a card — its `CardTitle` is
	 * already a heading, and an `h2` under an `h3` card title walks the outline backwards.
	 */
	headingLevel?: 'h2' | 'h3' | 'h4';
	icon: LucideIcon;
	title: string;
	variant?: 'compact' | 'default';
}

/**
 * Shared empty-state panel. Renders a tinted icon tile, a short title, an
 * optional description, and an optional action slot. Used whenever a page
 * section would otherwise be a blank card or dashed placeholder.
 */
function EmptyState({
	action,
	className,
	description,
	headingLevel: Heading = 'h2',
	icon: Icon,
	title,
	variant = 'default',
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				'flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-card/40 text-center',
				variant === 'default' ? 'gap-4 px-6 py-12' : 'gap-3 px-4 py-8',
				className,
			)}>
			<div
				aria-hidden="true"
				className="glow-primary/30 flex size-12 items-center justify-center rounded-xl bg-muted/60 text-primary">
				<Icon className="size-6" />
			</div>
			<div className="space-y-1.5">
				<Heading className="text-h3">{title}</Heading>
				{description && (
					<p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{action && <div className="pt-1">{action}</div>}
		</div>
	);
}

export { EmptyState };
