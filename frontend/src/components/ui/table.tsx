import * as React from 'react';

import { cn } from '@/lib/utils';

/**
 * Table, with its own horizontal scroller.
 *
 * The scroller has always been here; what was missing was any sign that it existed. A table wider
 * than its card was clipped by the card's `overflow-hidden` at a hard vertical edge, with no
 * gradient, no shadow and no partially-visible column — nothing on screen distinguished "this row
 * ends here" from "this row continues". At 390px that hid the Actions column of every settings
 * table behind a gesture the interface never advertised.
 *
 * The cue is conditional, not decorative: it appears only while there is scroll remaining to the
 * right and disappears at maximum scroll. A permanent gradient is read as chrome within a screen or
 * two and stops carrying information, which is the failure mode this is meant to fix.
 */
function Table({ className, ...props }: React.ComponentProps<'table'>) {
	const scrollerRef = React.useRef<HTMLDivElement>(null);
	const [hasScrollRemaining, setHasScrollRemaining] = React.useState(false);

	React.useEffect(() => {
		const scroller = scrollerRef.current;
		if (!scroller) return;

		const update = () => {
			// 1px of slack: fractional layout widths make an exact comparison report a
			// sub-pixel of remaining scroll on tables that are not actually scrollable.
			setHasScrollRemaining(
				scroller.scrollLeft < scroller.scrollWidth - scroller.clientWidth - 1,
			);
		};
		update();

		scroller.addEventListener('scroll', update, { passive: true });
		// Both elements are observed: the container changes with the viewport, and the table
		// changes with the data. Either one moving changes whether there is scroll left.
		const observer = new ResizeObserver(update);
		observer.observe(scroller);
		const table = scroller.firstElementChild;
		if (table) observer.observe(table);

		return () => {
			scroller.removeEventListener('scroll', update);
			observer.disconnect();
		};
	}, []);

	return (
		<div className="relative">
			<div className="w-full overflow-x-auto" data-slot="table-container" ref={scrollerRef}>
				<table
					className={cn('w-full caption-bottom text-sm', className)}
					data-slot="table"
					{...props}
				/>
			</div>
			{hasScrollRemaining && (
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-linear-to-l from-card to-transparent"
					data-slot="table-scroll-cue"
				/>
			)}
		</div>
	);
}

function TableHeader({ className, ...props }: React.ComponentProps<'thead'>) {
	return (
		<thead className={cn('[&_tr]:border-b', className)} data-slot="table-header" {...props} />
	);
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
	return (
		<tbody
			className={cn('[&_tr:last-child]:border-0', className)}
			data-slot="table-body"
			{...props}
		/>
	);
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
	return (
		<tfoot
			className={cn('border-t bg-muted/50 font-medium [&>tr]:last:border-b-0', className)}
			data-slot="table-footer"
			{...props}
		/>
	);
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
	return (
		<tr
			className={cn(
				// Selection is a tint, not a shade: `bg-muted` is the exact colour the bulk-action
				// bar and every other muted surface computes to, so a selected row and the strip
				// describing it read as one flat grey with no relationship between them.
				// `group/row` is what lets a sticky cell repaint itself in the row's own hover and
				// selected colours — see STICKY_CELL_CLASS in data-table/stickyColumns.ts.
				'group/row border-b transition-colors [contain-intrinsic-size:0_48px] [content-visibility:auto] hover:bg-muted/50 data-[state=selected]:bg-primary/10',
				className,
			)}
			data-slot="table-row"
			{...props}
		/>
	);
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
	return (
		<th
			className={cn(
				// The header band separates from the data band on colour and size, not on
				// weight alone: at the same 14px and the same foreground colour, a 100-weight
				// step is not enough and the header reads as one more row. `h-10` is kept so
				// the sharper type costs no row height.
				'h-10 px-2 text-left align-middle text-xs font-medium tracking-wide whitespace-nowrap text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
				className,
			)}
			data-slot="table-head"
			{...props}
		/>
	);
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
	return (
		<td
			className={cn(
				'px-2 py-(--density-padding-y) align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]',
				className,
			)}
			data-slot="table-cell"
			{...props}
		/>
	);
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
	return (
		<caption
			className={cn('mt-4 text-sm text-muted-foreground', className)}
			data-slot="table-caption"
			{...props}
		/>
	);
}

export { Table, TableBody, TableCaption, TableCell, TableFooter, TableHead, TableHeader, TableRow };
