import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * PADDING CONTRACT — the two axes have different owners:
 *
 * - `Card` owns the **vertical** padding (`py-6`).
 * - `CardHeader` / `CardContent` / `CardFooter` own the **horizontal** padding (`px-6`).
 *
 * So a bare `p-*` on CardContent does two wrong things at once: it *adds* to the card's own
 * vertical padding instead of replacing it, and it *replaces* the horizontal padding, usually
 * with a smaller value than the neighbouring cards use. `p-4` on a default Card yields 40px of
 * vertical padding and 16px of horizontal — the opposite of the intent both times.
 *
 * To make a card tighter, set the axes where they live:
 * `<Card className="py-4"><CardContent className="px-4">`.
 */
interface CardProps extends React.ComponentProps<'div'> {
	/** When true, the card grows a softer hover shadow for clickable affordance. */
	interactive?: boolean;
	/**
	 * Visual elevation. `default` is a subtle card with border + card shadow;
	 * `elevated` drops the border and uses a larger popover-grade shadow
	 * (auth pages, hero panels).
	 */
	variant?: 'default' | 'elevated';
}

function Card({ className, interactive = false, variant = 'default', ...props }: CardProps) {
	return (
		<div
			className={cn(
				'flex flex-col gap-6 rounded-xl bg-card py-6 text-card-foreground',
				variant === 'default' && 'border shadow-[var(--shadow-card)]',
				variant === 'elevated' && 'shadow-[var(--shadow-elevated)]',
				interactive &&
					'transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]',
				className,
			)}
			data-slot="card"
			{...props}
		/>
	);
}

/**
 * Card header. Two columns from `sm` up — title/description on the left, `CardAction` pinned to the
 * right — and a single stacked column below it.
 *
 * The stack is not cosmetic. `grid-cols-[1fr_auto]` gives the action track an `auto` width whose
 * automatic minimum is the action's own min-content, and `1fr` is shorthand for `minmax(auto,1fr)`,
 * so the title track carries the same floor. Neither yields, and a definite card width does not
 * clamp either of them: at 360px the two tracks together exceeded the 334px card on
 * /settings/notifications and /settings/runtime-config, and the title was squeezed to less than the
 * width of its own text while the action still overhung the edge. Below `sm` there is not enough
 * room for a right-hand action column at all, so the action goes under the title where it has the
 * full width. `CardAction`'s grid placement is inert in the flex column and needs no gating.
 */
function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'@container/card-header flex flex-col items-start gap-2 px-6 [.border-b]:pb-6',
				'sm:grid sm:auto-rows-min sm:grid-rows-[auto_auto] sm:items-start sm:has-data-[slot=card-action]:grid-cols-[1fr_auto]',
				className,
			)}
			data-slot="card-header"
			{...props}
		/>
	);
}

/**
 * Card heading. Carries an explicit type step (`text-lg`) so a card title is never the same size
 * as its own description or the field labels beneath it. `cn` merges Tailwind classes, so a call
 * site that passes its own `text-*` still wins.
 *
 * HEADING LEVEL CONVENTION — the ladder this app uses:
 *
 * - `PageHeader` owns the page's single `h1`.
 * - `SectionHeader` is the `h2` above a *group* of cards (`level="h3"` when nested).
 * - `CardTitle` is `h2` by default — correct for a card sitting directly under the page header —
 *   and takes `as="h3"` when the card sits under a `SectionHeader`.
 *
 * The default is a heading, not a `div`, and that is the whole point: this component rendered a
 * `<div>` for its entire life, so nearly every page had exactly one heading in `<main>` while every
 * card carried heading *appearance* and no heading *semantics*. Seven independent reviewers across
 * two design sweeps reported it. Defaulting to `h2` rather than `h3` is deliberate — a card under
 * a section is a *peer* of its section header in the outline, which is imprecise but legal, whereas
 * an `h3` under an `h1` skips a level, which is not (WCAG H42).
 *
 * Pass `as="div"` when the title is a **label above a value** rather than the card's heading —
 * `StatCard` and the dashboard widgets are the cases. A label promoted to a heading pollutes the
 * outline with the same word the value already says.
 *
 * `asChild` remains for the rare call site that must supply its own element.
 */
function CardTitle({
	as: As = 'h2',
	asChild = false,
	className,
	...props
}: {
	as?: 'div' | 'h1' | 'h2' | 'h3' | 'h4';
	asChild?: boolean;
} & React.ComponentProps<'div'>) {
	const Comp = asChild ? Slot : As;

	return (
		<Comp
			className={cn('text-lg leading-none font-semibold', className)}
			data-slot="card-title"
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			// Muted copy holds a readable measure; headings and content keep the full card width.
			// Uncapped, a 131-character description set as one unbroken line at 1440 and above.
			className={cn('max-w-[65ch] text-sm text-muted-foreground', className)}
			data-slot="card-description"
			{...props}
		/>
	);
}

function CardAction({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'col-start-2 row-span-2 row-start-1 self-start justify-self-end',
				className,
			)}
			data-slot="card-action"
			{...props}
		/>
	);
}

function CardContent({ className, ...props }: React.ComponentProps<'div'>) {
	return <div className={cn('px-6', className)} data-slot="card-content" {...props} />;
}

function CardFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn('flex items-center px-6 [.border-t]:pt-6', className)}
			data-slot="card-footer"
			{...props}
		/>
	);
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle };
