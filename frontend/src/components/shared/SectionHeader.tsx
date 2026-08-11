import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface SectionHeaderProps {
	/** Trailing controls for the section — a refresh button, a time-range selector. */
	children?: ReactNode;
	className?: string;
	description?: ReactNode;
	/**
	 * Heading level. `h2` for a section directly under the page title, `h3` for one nested
	 * inside another section. The level is an outline decision, not a size decision: both
	 * render at the same `text-h2` step, because a section header's size says "this is a
	 * section", not "this is the third one down".
	 */
	level?: 'h2' | 'h3';
	title: ReactNode;
}

/**
 * Heading for a page section that is not itself a card — a group of cards, a chart pair, a
 * table with its own controls.
 *
 * This is the missing rung between `PageHeader` (the page's `h1`) and `CardTitle` (a heading
 * *inside* a card). Without it, sections were titled by hand and drifted: on
 * /settings/system-health three peer sections carried `text-sm font-medium`, which is smaller
 * than the `text-base` card titles sitting underneath them — the heading was outranked by the
 * things it was heading.
 *
 * Use this whenever a section title would otherwise be a bare `<h2>`/`<h3>` with hand-picked
 * type classes. A section that is a *single* panel does not need it: give that panel a
 * `CardHeader` with a `CardTitle` instead.
 *
 * The step is `text-h2` (1.5rem, display font), not `text-h3`. At `text-h3` it computed to
 * 1.125rem/600 — byte-for-byte what `CardTitle` computes to — so a section header and the card
 * titles it was heading were indistinguishable, and the rung this component exists to provide did
 * not visually exist. The ladder is now `text-display` (PageHeader h1) → `text-h2` (here) →
 * `text-lg` (CardTitle), with a real gap at each step.
 */
function SectionHeader({
	children,
	className,
	description,
	level = 'h2',
	title,
}: SectionHeaderProps) {
	const Heading = level;

	return (
		<div className={cn('flex items-start justify-between gap-4', className)}>
			<div className="min-w-0">
				<Heading className="text-h2">{title}</Heading>
				{description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
			</div>
			{children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
		</div>
	);
}

export { SectionHeader };
export type { SectionHeaderProps };
