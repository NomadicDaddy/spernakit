import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
	action?: ReactNode;
	className?: string;
	description?: ReactNode;
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
	icon: Icon,
	title,
	variant = 'default',
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				'border-border/60 bg-card/40 flex flex-col items-center justify-center rounded-xl border border-dashed text-center',
				variant === 'default' ? 'gap-4 px-6 py-12' : 'gap-3 px-4 py-8',
				className
			)}>
			<div
				aria-hidden="true"
				className="bg-muted/60 text-primary glow-primary/30 flex size-12 items-center justify-center rounded-xl">
				<Icon className="size-6" />
			</div>
			<div className="space-y-1.5">
				<h2 className="text-h3">{title}</h2>
				{description && (
					<p className="text-muted-foreground mx-auto max-w-md text-sm">{description}</p>
				)}
			</div>
			{action && <div className="pt-1">{action}</div>}
		</div>
	);
}

export { EmptyState };
