import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * One status vocabulary, app-wide:
 *
 * - **State** — `success`, `warning`, `destructive`. Tinted, never a saturated fill: a solid
 *   palette colour with white text cannot reach AA at this component's 12px/500 size, so the
 *   colour carries the text and the background carries a 15% wash of it.
 * - **Identity and metadata** (role, kind, HTTP method, column constraint) — `outline` or
 *   `secondary`. Neutral. These are not states and must not borrow state colour.
 * - **Actions** — `default`. `bg-primary` is reserved for things you click.
 *
 * Do not pass palette utilities (`bg-green-500`, `bg-red-500`) through `className` to improvise a
 * state. That is how red came to mean SYSOP, unhealthy, is-a-bug, is-Open and NOT NULL at once.
 */
const badgeVariants = cva(
	'inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden',
	{
		defaultVariants: {
			variant: 'default',
		},
		variants: {
			variant: {
				default: 'bg-primary text-primary-foreground [a&]:hover:bg-primary/90',
				destructive:
					'border-destructive/30 bg-destructive/15 text-destructive focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 [a&]:hover:bg-destructive/25',
				ghost: '[a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
				link: 'text-primary underline-offset-4 [a&]:hover:underline',
				outline:
					'border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
				secondary: 'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90',
				success: 'border-success/30 bg-success/15 text-success [a&]:hover:bg-success/25',
				warning: 'border-warning/30 bg-warning/15 text-warning [a&]:hover:bg-warning/25',
			},
		},
	},
);

function Badge({
	asChild = false,
	className,
	variant = 'default',
	...props
}: { asChild?: boolean } & React.ComponentProps<'span'> & VariantProps<typeof badgeVariants>) {
	const Comp = asChild ? Slot : 'span';

	return (
		<Comp
			className={cn(badgeVariants({ variant }), className)}
			data-slot="badge"
			data-variant={variant}
			{...props}
		/>
	);
}

export { Badge, badgeVariants };
