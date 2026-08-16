import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { getFocusOrigin, trackFocusHistory } from '@/lib/focusReturn';
import { cn } from '@/lib/utils';

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
	return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogTrigger({
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Trigger>) {
	return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />;
}

function AlertDialogPortal({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Portal>) {
	return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />;
}

function AlertDialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Overlay>) {
	return (
		<AlertDialogPrimitive.Overlay
			className={cn(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
				className,
			)}
			data-slot="alert-dialog-overlay"
			{...props}
		/>
	);
}

function AlertDialogContent({
	className,
	onCloseAutoFocus,
	onOpenAutoFocus,
	size = 'default',
	...props
}: {
	/**
	 * Width tier. `default` is the 512px prompt width, `sm` the 320px one, and `lg` the 672px
	 * management panel used by dialogs that hold a list rather than a question.
	 *
	 * Width belongs here rather than in a `max-w-*` utility passed through `className`: the
	 * default tier is spelled `data-[size=default]:sm:max-w-lg`, whose attribute selector
	 * outranks a plain `max-w-2xl` and is not merged away by `cn`, so a caller asking for a
	 * wider dialog still rendered at 512px with the losing class sitting in the class list.
	 */
	size?: 'default' | 'lg' | 'sm';
} & React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
	/*
	 * `grid-cols-[minmax(0,1fr)]` below is not decoration. Without a declared column this is a grid
	 * with one implicit `auto` track, and an `auto` track's automatic minimum is its items'
	 * min-content — which a definite container width does not clamp. The Members panel's add row
	 * demanded 407px (a 167px user picker, a 128px role select, a 64px Add button and their gaps),
	 * so the track held 407 inside a 311px dialog and every Remove button painted at x=399 against
	 * a right edge of 329: zero intersection, at a scroll offset no touch can reach because the
	 * panel clips.
	 *
	 * Fixed here rather than in the one dialog that exposed it, because every alert dialog inherits
	 * the same implicit track and the next wide child would burst it the same way.
	 */

	/*
	 * Focus return, for the same reason DialogContent carries it — and more urgently: nothing in
	 * this app uses `AlertDialogTrigger`, so every confirm prompt is opened from a button Radix
	 * never sees and has no element to hand focus back to when it closes. Answering "are you sure?"
	 * dropped the keyboard user on `<body>`. See dialog.tsx for why the opener is read on open
	 * rather than during render, and lib/focusReturn.ts for how it is found.
	 */
	trackFocusHistory();
	const returnFocusRef = React.useRef<HTMLElement | null>(null);

	const handleOpenAutoFocus = (event: Event) => {
		returnFocusRef.current = getFocusOrigin();
		onOpenAutoFocus?.(event);
	};

	const handleCloseAutoFocus = (event: Event) => {
		onCloseAutoFocus?.(event);
		if (event.defaultPrevented) return;

		const opener = returnFocusRef.current;
		returnFocusRef.current = null;
		if (opener?.isConnected) {
			event.preventDefault();
			opener.focus();
		}
	};

	return (
		<AlertDialogPortal>
			<AlertDialogOverlay />
			<AlertDialogPrimitive.Content
				className={cn(
					'group/alert-dialog-content fixed top-[50%] left-[50%] z-50 grid max-h-[85vh] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] grid-cols-[minmax(0,1fr)] gap-4 overflow-y-auto overscroll-contain rounded-xl border bg-card p-6 text-card-foreground shadow-[var(--shadow-elevated)] duration-200 data-[size=sm]:max-w-xs data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[size=default]:sm:max-w-lg data-[size=lg]:sm:max-w-2xl',
					className,
				)}
				data-size={size}
				data-slot="alert-dialog-content"
				{...props}
				onCloseAutoFocus={handleCloseAutoFocus}
				onOpenAutoFocus={handleOpenAutoFocus}
			/>
		</AlertDialogPortal>
	);
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			/*
			 * The `sm:` alignment override is unqualified by content size. It used to apply only to
			 * `size=default`, so the `size="lg"` Members dialog rendered a centred title and
			 * description above a left-flush body of member rows, a search field and footer buttons
			 * — one centred block floating over otherwise left-aligned content, opened from the same
			 * row menu as the default-size dialogs that align correctly. Nothing about a dialog being
			 * wider warrants a different alignment rule. The centred stack remains the below-`sm:`
			 * default for every size.
			 */
			className={cn(
				'grid grid-rows-[auto_1fr] place-items-center gap-1.5 text-center has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] has-data-[slot=alert-dialog-media]:gap-x-6 sm:place-items-start sm:text-left sm:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]',
				className,
			)}
			data-slot="alert-dialog-header"
			{...props}
		/>
	);
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				'flex flex-col-reverse gap-2 group-data-[size=sm]/alert-dialog-content:grid group-data-[size=sm]/alert-dialog-content:grid-cols-2 sm:flex-row sm:justify-end',
				className,
			)}
			data-slot="alert-dialog-footer"
			{...props}
		/>
	);
}

function AlertDialogTitle({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
	return (
		<AlertDialogPrimitive.Title
			className={cn(
				// Unqualified by content size, to stay in step with AlertDialogHeader's alignment rule
				// above — a size-qualified media layout under an unqualified header grid would leave
				// a wide dialog's media out of its own column.
				'text-lg font-semibold sm:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2',
				className,
			)}
			data-slot="alert-dialog-title"
			{...props}
		/>
	);
}

function AlertDialogDescription({
	className,
	...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
	return (
		<AlertDialogPrimitive.Description
			className={cn('text-sm text-muted-foreground', className)}
			data-slot="alert-dialog-description"
			{...props}
		/>
	);
}

function AlertDialogMedia({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn(
				// Unqualified by content size — see the note on AlertDialogTitle.
				"mb-2 inline-flex size-16 items-center justify-center rounded-md bg-muted sm:row-span-2 *:[svg:not([class*='size-'])]:size-8",
				className,
			)}
			data-slot="alert-dialog-media"
			{...props}
		/>
	);
}

function AlertDialogAction({
	className,
	size = 'default',
	variant = 'default',
	...props
}: Pick<React.ComponentProps<typeof Button>, 'size' | 'variant'> &
	React.ComponentProps<typeof AlertDialogPrimitive.Action>) {
	return (
		<Button asChild size={size} variant={variant}>
			<AlertDialogPrimitive.Action
				className={cn(className)}
				data-slot="alert-dialog-action"
				{...props}
			/>
		</Button>
	);
}

function AlertDialogCancel({
	className,
	size = 'default',
	variant = 'outline',
	...props
}: Pick<React.ComponentProps<typeof Button>, 'size' | 'variant'> &
	React.ComponentProps<typeof AlertDialogPrimitive.Cancel>) {
	return (
		<Button asChild size={size} variant={variant}>
			<AlertDialogPrimitive.Cancel
				className={cn(className)}
				data-slot="alert-dialog-cancel"
				{...props}
			/>
		</Button>
	);
}

export {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogMedia,
	AlertDialogOverlay,
	AlertDialogPortal,
	AlertDialogTitle,
	AlertDialogTrigger,
};
