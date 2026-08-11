import * as React from 'react';

import { cn } from '@/lib/utils';

function Table({ className, ...props }: React.ComponentProps<'table'>) {
	return (
		<div className="relative w-full overflow-x-auto" data-slot="table-container">
			<table
				className={cn('w-full caption-bottom text-sm', className)}
				data-slot="table"
				{...props}
			/>
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
				'border-b transition-colors [contain-intrinsic-size:0_48px] [content-visibility:auto] hover:bg-muted/50 data-[state=selected]:bg-primary/10',
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
