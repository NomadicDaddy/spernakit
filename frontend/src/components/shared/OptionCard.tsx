import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

interface OptionCardProps {
	className?: string;
	/** Short explanation shown under the label. Omit for options whose label says it all. */
	description?: string;
	disabled?: boolean;
	/** Leading visual — a lucide icon element. Ignored when `swatch` is set. */
	icon?: ReactNode;
	label: string;
	onSelect: () => void;
	selected: boolean;
	/** A CSS colour rendered as a round swatch, for options that *are* a colour. */
	swatch?: string;
}

/**
 * A single selectable option in a single-select group — theme, layout, container width.
 *
 * Selection is encoded **once**, as `border-primary` plus a `bg-primary/10` tint. It is
 * deliberately not a ring: `ring-offset-2` without `ring-offset-background` leaves
 * `--tw-ring-offset-color` at Tailwind's `#fff` default, which drew a hard white halo around
 * every selected option in a dark app. Encoding selection twice — a filled button *and* a ring —
 * was the other half of the same problem.
 *
 * This is the house pattern for "pick one of N". Reach for it instead of a row of `Button`s with
 * `variant={selected ? 'default' : 'outline'}`: buttons say "do something", and a settings option
 * is a state, not an action. The tile also scales to options that need a description or a swatch,
 * which a pill cannot.
 *
 * "Pick one of N" is what `role="radio"` means, so that is what it renders — `aria-pressed` said
 * only "this toggle is on" and left the exclusivity, the group and the position-in-set unstated.
 * Always place it inside an `OptionCardGroup`, which supplies the `radiogroup` the role belongs to
 * and the arrow-key movement it promises; the `tabIndex` here is that group's roving tabstop.
 */
function OptionCard({
	className,
	description,
	disabled = false,
	icon,
	label,
	onSelect,
	selected,
	swatch,
}: OptionCardProps) {
	return (
		<button
			aria-checked={selected}
			className={cn(
				'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
				'outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50',
				'disabled:pointer-events-none disabled:opacity-50',
				selected
					? 'border-primary bg-primary/10'
					: 'border-border hover:border-primary/50 hover:bg-accent/40',
				className,
			)}
			disabled={disabled}
			onClick={onSelect}
			role="radio"
			tabIndex={selected ? 0 : -1}
			type="button">
			{swatch === undefined
				? icon && (
						<span
							className={cn(
								'shrink-0',
								selected ? 'text-primary' : 'text-muted-foreground',
							)}>
							{icon}
						</span>
					)
				: null}
			{swatch !== undefined && (
				<span
					aria-hidden="true"
					className="size-8 shrink-0 rounded-full"
					style={{ backgroundColor: swatch }}
				/>
			)}
			<span className="min-w-0">
				<span className="block text-sm font-medium">{label}</span>
				{description && (
					<span className="block text-xs leading-snug text-muted-foreground">
						{description}
					</span>
				)}
			</span>
		</button>
	);
}

export { OptionCard };
export type { OptionCardProps };
