import * as DialogPrimitive from '@radix-ui/react-dialog';
import { XIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { getFocusOrigin, trackFocusHistory } from '@/lib/focusReturn';
import { cn } from '@/lib/utils';

function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root data-slot="dialog" {...props} />;
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			className={cn(
				'fixed inset-0 z-50 bg-black/50 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0',
				className,
			)}
			data-slot="dialog-overlay"
			{...props}
		/>
	);
}

function DialogContent({
	children,
	className,
	onCloseAutoFocus,
	onOpenAutoFocus,
	showCloseButton = true,
	...props
}: {
	showCloseButton?: boolean;
} & React.ComponentProps<typeof DialogPrimitive.Content>) {
	/*
	 * Return focus to whatever opened this dialog. See lib/focusReturn.ts for why Radix does not do
	 * it for the dialogs in this app and why `document.activeElement` alone is not enough to.
	 *
	 * The origin is read on open rather than during render: `DialogPrimitive.Root` renders its
	 * children whether or not the dialog is open, so this component stays mounted for the life of
	 * the page and a render-time read records the page's initial `activeElement` — `<body>` — and
	 * never updates. `onOpenAutoFocus` fires from Radix's focus scope before it moves focus into
	 * the dialog, which is the last moment the opener is still readable.
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

		// Re-checked rather than trusted: the opener can be gone by now — a row menu's button
		// disappears with its row when the dialog deletes it. Focusing a detached node silently
		// moves focus to `<body>`, the very thing this is here to prevent, so leave Radix's own
		// default in place instead.
		if (opener?.isConnected) {
			event.preventDefault();
			opener.focus();
		}
	};

	/*
	 * `grid-cols-[minmax(0,1fr)]` for the same reason AlertDialogContent carries it: an undeclared
	 * grid column is an `auto` track, whose automatic minimum is its items' min-content and which a
	 * definite container width does not clamp. Here it measured a 385px track inside a 350px dialog
	 * on /profile/api-keys, pushing the CopyButton off the one screen where the secret is shown
	 * exactly once and cannot be re-read.
	 */
	return (
		<DialogPortal data-slot="dialog-portal">
			<DialogOverlay />
			<DialogPrimitive.Content
				aria-describedby={undefined}
				className={cn(
					'fixed top-[50%] left-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] grid-cols-[minmax(0,1fr)] gap-4 overscroll-contain rounded-xl border bg-card p-6 text-card-foreground shadow-[var(--shadow-elevated)] duration-200 outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 sm:max-w-lg',
					className,
				)}
				data-slot="dialog-content"
				{...props}
				onCloseAutoFocus={handleCloseAutoFocus}
				onOpenAutoFocus={handleOpenAutoFocus}>
				{children}
				{showCloseButton && (
					/*
					 * A real hit area around the icon. The close sized to its own `size-4` glyph and
					 * nothing else, so the target measured exactly 16x16 — under the 24x24 minimum
					 * (WCAG 2.2 SC 2.5.8), and on any dialog whose footer carries no Cancel it is the
					 * only way out. `size-8` matches the icon buttons used elsewhere in the app's
					 * chrome.
					 *
					 * The inset stays at 4. An earlier pass dropped it to 2 to "keep the glyph where
					 * it has always been, 24px from each edge" — the arithmetic was wrong: `top-2`
					 * (8px) plus half the 32px box less half the 16px glyph puts the glyph edge at
					 * 16px, not 24px, so it sat 8px proud of the `p-6` content inset the title and
					 * body align to and read as floating outside the dialog's own content box.
					 * `top-4` gives 16 + 8 = 24px, the same inset as everything else in the panel.
					 */
					<DialogPrimitive.Close
						className="absolute top-4 right-4 flex size-8 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
						data-slot="dialog-close">
						<XIcon />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
	return (
		<div
			className={cn('flex flex-col gap-2 text-center sm:text-left', className)}
			data-slot="dialog-header"
			{...props}
		/>
	);
}

function DialogFooter({
	children,
	className,
	showCloseButton = false,
	...props
}: {
	showCloseButton?: boolean;
} & React.ComponentProps<'div'>) {
	return (
		<div
			className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)}
			data-slot="dialog-footer"
			{...props}>
			{children}
			{showCloseButton && (
				<DialogPrimitive.Close asChild>
					<Button variant="outline">Close</Button>
				</DialogPrimitive.Close>
			)}
		</div>
	);
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn('text-lg leading-none font-semibold', className)}
			data-slot="dialog-title"
			{...props}
		/>
	);
}

function DialogDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			className={cn('text-sm text-muted-foreground', className)}
			data-slot="dialog-description"
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
