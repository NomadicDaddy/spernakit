import { Key } from 'lucide-react';

import type { ColumnInfo, TableMetadata } from '@/api/databaseAdmin';

import { Badge } from '@/components/ui/badge';

/**
 * The two row primitives `SchemaExplorerPanel` fills its cards with, and nothing else.
 *
 * They live beside the panel rather than inside it for the same reason `ErdGraphPrimitives` does:
 * the panel owns the queries, the scroll caps and the responsive grid, and holding three more
 * presentational components on top of that put the file past the 300-line gate. Split on the seam
 * that was already there — everything here is pure props in, markup out.
 */

/** One table in the left-hand list: its name, its counts, and whether it is the selected one. */
function TableRow({
	isSelected,
	onSelect,
	table,
}: {
	isSelected: boolean;
	onSelect: () => void;
	table: TableMetadata;
}) {
	return (
		/*
		 * The selected row is the acknowledgement of the tap. `bg-primary/10` alone was a 10% tint
		 * of a colour that is already close to the card behind it — legible on a desk monitor, and
		 * on a phone in daylight indistinguishable from the hover state a touch device never shows.
		 * The inset ring gives the row an edge, which survives glare and greyscale in a way a tint
		 * does not; `aria-current` is the same fact for a screen reader, which the colour never was.
		 */
		<button
			aria-current={isSelected ? 'true' : undefined}
			className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors ${
				isSelected
					? 'bg-primary/10 font-semibold text-primary ring-1 ring-primary/40 ring-inset'
					: 'hover:bg-muted'
			}`}
			onClick={onSelect}
			type="button">
			{/*
			 * `min-w-0 truncate` on the name, `shrink-0` on the counts. A flex item's automatic
			 * minimum is its min-content size, so an undecorated table name set this row's floor
			 * and the whole panel's with it. The counts are two short badges and should never be
			 * the thing that gives way; the name is the part with a natural truncation point.
			 *
			 * `basis-64` in place of the row's old `justify-between`. This panel is half of a
			 * two-column grid — 678px at 2560 — and pinning the badges to the right edge put
			 * "audit_logs" 457px from the "179 rows" that describes it, on every row of the list.
			 * 16rem is what the longest name here needs (`user_notification_preferences` measures
			 * ~210px at this size), so the badges start at one x on every row — still a column to
			 * scan — while sitting a fixed ~180px at most from the name they belong to. The basis
			 * shrinks on a phone, where the name truncates instead.
			 */}
			<span className="min-w-0 basis-64 truncate font-medium">{table.tableName}</span>
			{/*
			 * A fixed first track and `tabular-nums`, so the two counts form columns down 26 rows.
			 * The badges are right of a fixed-basis name, so the pair already started at one x — but
			 * inside the pair the `N cols` chip is as wide as its digits, so the `N rows` chip moved
			 * with it and neither number's digits lined up: measured badge-group starts ran 663–677
			 * across four consecutive rows at 1440. `tailwind.css:322` already applies tabular figures
			 * to every `<table>`; this list is buttons, so it silently opted out of the rule the rest
			 * of the app follows.
			 *
			 * Both chips `secondary`. They were `secondary` and `outline` — a filled chip beside a
			 * hairline one, 8px apart, 26 times — and the weight difference implied a difference in
			 * kind between two counts that are the same kind of thing, with the heavier treatment on
			 * the less interesting of the two numbers. `badge.tsx` allows either for metadata; what it
			 * does not license is disagreeing within one cluster.
			 */}
			<div className="grid shrink-0 grid-cols-[4.5rem_auto] gap-2">
				<Badge className="w-fit tabular-nums" variant="secondary">
					{table.columnCount} cols
				</Badge>
				{/* `1 rows` read as unfinished on four of the 26 tables. */}
				<Badge className="w-fit tabular-nums" variant="secondary">
					{table.rowCount} row{table.rowCount === 1 ? '' : 's'}
				</Badge>
			</div>
		</button>
	);
}

/** The selected table's columns, each paired with the foreign key that starts at it. */
function ColumnList({
	columns,
	foreignKeys,
}: {
	columns: ColumnInfo[];
	foreignKeys: { sourceColumn: string; targetColumn: string; targetTable: string }[];
}) {
	const fkMap = new Map(foreignKeys.map((fk) => [fk.sourceColumn, fk]));
	return (
		<div className="space-y-2">
			{columns.map((col) => (
				<ColumnRow column={col} fk={fkMap.get(col.name)} key={col.name} />
			))}
		</div>
	);
}

function ColumnRow({
	column,
	fk,
}: {
	column: ColumnInfo;
	fk: { sourceColumn: string; targetColumn: string; targetTable: string } | undefined;
}) {
	return (
		/*
		 * `flex-wrap` and `gap-2`: a column row carries a name, a type, and up to three badges, and
		 * `FK → some_table.some_column` alone is wider than a 334px panel at 360px. Unwrapped, the
		 * row's min-content was the sum of all five and it widened the card rather than the card
		 * bounding it. Wrapping lets the constraint badges drop to a second line, which is the
		 * reading order they already have.
		 */
		<div className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2">
			<div className="flex min-w-0 items-center gap-2">
				{column.isPrimaryKey && (
					<Key aria-hidden="true" className="h-3.5 w-3.5 text-primary" />
				)}
				<span className="text-sm font-medium">{column.name}</span>
				<span className="text-xs text-muted-foreground">{column.type}</span>
			</div>
			{/*
			 * These three carried `text-[10px]` — an arbitrary value below the smallest step in the
			 * scale — while the `N cols` / `N rows` badges 24px to the left used the Badge default,
			 * so two badge sizes sat side by side in one panel.
			 */}
			<div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
				{/* A column constraint is metadata, not a fault — neutral, like FK beside it. */}
				{column.notnull && <Badge variant="outline">NOT NULL</Badge>}
				{column.defaultValue !== null && (
					<Badge variant="secondary">{column.defaultValue}</Badge>
				)}
				{/*
				 * The one badge in this row whose text is unbounded: it names another table and
				 * another column, so `FK → user_notification_preferences.user_id` runs ~40 characters
				 * against a card that is about 300px wide inside a 360px viewport. Badge defaults to
				 * `whitespace-nowrap shrink-0`, which is right for a chip holding one word and wrong
				 * for this one — the row's `flex-wrap` above could only move the badge onto its own
				 * line, never make it narrower, so the badge still set the card's min-content width
				 * and the panel scrolled sideways. Wrapping inside the pill is the only give left.
				 *
				 * `break-words`, not `break-all`: it breaks a table name only when the line cannot
				 * hold it, so the common short keys still read as one unbroken `table.column`.
				 */}
				{fk && (
					<Badge
						className="min-w-0 shrink break-words whitespace-normal"
						variant="outline">
						FK → {fk.targetTable}.{fk.targetColumn}
					</Badge>
				)}
			</div>
		</div>
	);
}

export { ColumnList, TableRow };
