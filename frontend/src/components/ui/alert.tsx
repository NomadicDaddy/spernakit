import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '@/lib/utils';

const alertVariants = cva(
	'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-lg border px-4 py-3 text-sm has-[>svg]:grid-cols-[calc(var(--spacing)*4)_1fr] has-[>svg]:gap-x-3 [&>svg]:size-4 [&>svg]:translate-y-0.5 [&>svg]:text-current',
	{
		defaultVariants: {
			variant: 'default',
		},
		variants: {
			variant: {
				default: 'bg-card text-card-foreground',
				destructive:
					'bg-card text-destructive *:data-[slot=alert-description]:text-destructive/90 [&>svg]:text-current',
			},
		},
	},
);

function Alert({
	className,
	variant,
	...props
}: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
	return (
		<div
			className={cn(alertVariants({ variant }), className)}
			data-slot="alert"
			role="alert"
			{...props}
		/>
	);
}

function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn('col-start-2 line-clamp-1 min-h-4 font-medium tracking-tight', className)}
			data-slot="alert-title"
			{...props}
		/>
	);
}

function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
	/*
	 * `max-w-[65ch]` is the same reading measure CardDescription carries (card.tsx, "Muted copy
	 * holds a readable measure"), and this was the one shared text slot in the app without it:
	 * the "Read-only runtime configuration" notice computed `max-width: none` and ran 1,410px —
	 * about 165 characters a line — at 2560, still ~140ch at 1440.
	 *
	 * It caps the text and not the alert. This is the grid's second column with
	 * `justify-items-start`, so the cap shortens the lines inside the cell while the Alert's own
	 * `w-full` border keeps spanning the card.
	 */
	return (
		<div
			className={cn(
				'col-start-2 grid max-w-[65ch] justify-items-start gap-1 text-sm text-muted-foreground [&_p]:leading-relaxed',
				className,
			)}
			data-slot="alert-description"
			{...props}
		/>
	);
}

export { Alert, AlertDescription, AlertTitle };
