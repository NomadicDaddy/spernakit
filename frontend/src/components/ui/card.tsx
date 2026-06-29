import * as React from 'react';

import { cn } from '@/lib/utils';

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
				'bg-card text-card-foreground flex flex-col gap-6 rounded-xl py-6',
				variant === 'default' && 'border shadow-[var(--shadow-card)]',
				variant === 'elevated' && 'shadow-[var(--shadow-elevated)]',
				interactive &&
					'transition-shadow duration-200 hover:shadow-[var(--shadow-card-hover)]',
				className
			)}
			data-slot="card"
			{...props}
		/>
	);
}

function CardHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6',
				className
			)}
			data-slot="card-header"
			{...props}
		/>
	);
}

function CardTitle({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn('leading-none font-semibold', className)}
			data-slot="card-title"
			{...props}
		/>
	);
}

function CardDescription({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn('text-muted-foreground text-sm', className)}
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
				className
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
