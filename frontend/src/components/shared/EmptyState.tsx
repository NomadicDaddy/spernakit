import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface EmptyStateProps {
	action?: ReactNode;
	className?: string;
	description?: ReactNode;
	/**
	 * Whether the panel draws its own dashed frame.
	 *
	 * Pass `none` when the action slot already carries a bordered element of its own. /files put a
	 * dashed drop zone inside this dashed panel, and the two edges measured 1.033:1 and 1.05:1
	 * against each other — no fill and no contrast between them, so the pair read as a rendering
	 * fault rather than as a panel containing a target. Only one of the two should be dashed, and
	 * between a decorative frame and an actual drop target the drop target is the one that earns it.
	 */
	frame?: 'dashed' | 'none';
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
	frame = 'dashed',
	headingLevel: Heading = 'h2',
	icon: Icon,
	title,
	variant = 'default',
}: EmptyStateProps) {
	return (
		<div
			className={cn(
				'flex flex-col items-center justify-center rounded-xl text-center',
				frame === 'dashed' && 'border border-dashed border-border/60 bg-card/40',
				variant === 'default' ? 'gap-4 px-6 py-12' : 'gap-3 px-4 py-8',
				className,
			)}>
			{/*
			 * `glow-primary`, not `glow-primary/30`. The glow utilities in tailwind.css are plain
			 * classes rather than `@utility` definitions, so they accept no opacity modifier — the
			 * modifier form matched no rule and every empty panel in the app computed
			 * `box-shadow: none`. The class already carries the softness it was reaching for (15%).
			 */}
			<div
				aria-hidden="true"
				className="glow-primary flex size-12 items-center justify-center rounded-xl bg-muted/60 text-primary">
				<Icon className="size-6" />
			</div>
			<div className="space-y-1.5">
				{/*
				 * The title's type step follows `headingLevel`, because the level is already the
				 * caller's statement of where this panel sits. At a fixed `text-h3` a panel nested
				 * inside a card announced itself as a peer of the card that contains it: on
				 * /profile/api-keys "API Keys" (CardTitle) and "No API keys yet" both computed
				 * 18px/600/Inter about 100px apart, with nothing to say which one ranked.
				 *
				 * `h2` — an empty state standing in for a whole page region, as on /files and
				 * /dashboards — keeps `text-h3`. Anything lower is nested under a CardTitle and
				 * steps down a rung, and `compact` steps down again for the same reason.
				 */}
				<Heading
					className={
						Heading === 'h2'
							? 'text-h3'
							: variant === 'compact'
								? 'text-sm font-semibold'
								: 'text-base font-semibold'
					}>
					{title}
				</Heading>
				{description && (
					<p className="mx-auto max-w-md text-sm text-muted-foreground">{description}</p>
				)}
			</div>
			{/*
			 * `flex w-full justify-center` rather than a bare block. The column above is
			 * `items-center`, which sizes every row to fit-content, so an action that asked for
			 * `w-full` got its content width instead: /files' mobile "Choose files" button rendered
			 * 131px wide inside a 342px panel. Centring on this row keeps the ordinary case — a lone
			 * `Button` — exactly where it was.
			 */}
			{action && <div className="flex w-full justify-center pt-1">{action}</div>}
		</div>
	);
}

export { EmptyState };
