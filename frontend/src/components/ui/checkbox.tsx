import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon, MinusIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * The mixed state has a look of its own.
 *
 * Upstream's snippet renders `<CheckIcon>` unconditionally and styles only `data-[state=checked]`,
 * so `indeterminate` had no visual vocabulary anywhere in the app: with one of five rows ticked on
 * /settings/users the header box reported `aria-checked="mixed"` and painted the identical check
 * glyph a fully-checked row paints, differing only in fill — a faint `oklch(1 0 0 / 0.045)` against
 * the primary blue. It read as a checked-but-disabled box sitting above four unchecked rows, when
 * what it meant was "some rows are selected". `createSelectColumn` wires the state correctly; the
 * Checkbox had nowhere to render it.
 *
 * A dash on the same filled primary ground, so a partial selection carries the same weight as a
 * full one and is distinguished by the glyph rather than by a fill nobody can name.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
	const indeterminate = props.checked === 'indeterminate';
	return (
		<CheckboxPrimitive.Root
			className={cn(
				'peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-shadow outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-[state=checked]:bg-primary dark:data-[state=indeterminate]:bg-primary',
				className,
			)}
			data-slot="checkbox"
			{...props}>
			<CheckboxPrimitive.Indicator
				className="grid place-content-center text-current transition-none"
				data-slot="checkbox-indicator">
				{indeterminate ? (
					<MinusIcon className="size-3.5" />
				) : (
					<CheckIcon className="size-3.5" />
				)}
			</CheckboxPrimitive.Indicator>
		</CheckboxPrimitive.Root>
	);
}

export { Checkbox };
