'use no memo';

import { useVirtualizer, type Virtualizer } from '@tanstack/react-virtual';
import { useRef } from 'react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { stringifyValue } from '@/lib/tableExport';

const ROW_HEIGHT = 32;
const VIRTUALIZE_THRESHOLD = 100;

interface SqlResultsTableProps {
	columns: string[];
	rowCount: number;
	rows: Record<string, unknown>[];
}

function SqlResultsTable({ columns, rowCount, rows }: SqlResultsTableProps) {
	const scrollRef = useRef<HTMLDivElement>(null);
	const shouldVirtualize = rows.length > VIRTUALIZE_THRESHOLD;

	// eslint-disable-next-line react-hooks/incompatible-library -- @tanstack/react-virtual API is not React Compiler compatible
	const virtualizer = useVirtualizer({
		count: rows.length,
		enabled: shouldVirtualize,
		estimateSize: () => ROW_HEIGHT,
		getScrollElement: () => scrollRef.current,
		overscan: 20,
	});

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle>
					Results ({rowCount} {rowCount === 1 ? 'row' : 'rows'} returned)
				</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{/*
				 * The height cap and the sticky header apply on both paths. Gating them on
				 * `shouldVirtualize` meant a 90-row result scrolled its column names away and pushed
				 * the rest of the page down, while a 110-row result did neither — two visibly
				 * different tables from one control, decided by a threshold the user cannot see.
				 */}
				<div className="max-h-[600px] overflow-auto" ref={scrollRef}>
					{/*
					 * `w-auto min-w-full`, not `w-full`: a one-column result was stretched across the
					 * whole card, leaving each value alone at the left of a 1470px band. Columns now
					 * size to their content and the table still fills the card when there is enough
					 * of it to fill.
					 */}
					<table className="w-auto min-w-full text-sm">
						<thead className="sticky top-0 z-10">
							<tr className="border-b bg-card">
								{columns.map((col) => (
									<th
										className="px-3 py-2 text-left font-medium whitespace-nowrap text-muted-foreground"
										key={col}>
										{col}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{shouldVirtualize ? (
								<VirtualTableBody
									columns={columns}
									rows={rows}
									virtualizer={virtualizer}
								/>
							) : (
								<StaticTableBody columns={columns} rows={rows} />
							)}
						</tbody>
					</table>
				</div>
			</CardContent>
		</Card>
	);
}

interface VirtualTableBodyProps {
	columns: string[];
	rows: Record<string, unknown>[];
	virtualizer: Virtualizer<HTMLDivElement, Element>;
}

function VirtualTableBody({ columns, rows, virtualizer }: VirtualTableBodyProps) {
	const virtualItems = virtualizer.getVirtualItems();

	return (
		<>
			{virtualItems.length > 0 && (
				<tr>
					<td
						colSpan={columns.length}
						style={{
							height: virtualItems[0]?.start ?? 0,
							padding: 0,
						}}
					/>
				</tr>
			)}
			{virtualItems.map((virtualRow) => {
				const row = rows[virtualRow.index];
				if (!row) return null;
				return (
					<tr
						className="border-b"
						data-index={virtualRow.index}
						key={virtualRow.index}
						ref={virtualizer.measureElement}>
						{columns.map((col) => (
							<td className="px-3 py-1.5 whitespace-nowrap" key={col}>
								<CellContent value={row[col]} />
							</td>
						))}
					</tr>
				);
			})}
			{virtualItems.length > 0 && (
				<tr>
					<td
						colSpan={columns.length}
						style={{
							height: virtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0),
							padding: 0,
						}}
					/>
				</tr>
			)}
		</>
	);
}

interface StaticTableBodyProps {
	columns: string[];
	rows: Record<string, unknown>[];
}

function StaticTableBody({ columns, rows }: StaticTableBodyProps) {
	return (
		<>
			{rows.map((row, i) => (
				<tr className="border-b last:border-b-0" key={i}>
					{columns.map((col) => (
						<td className="px-3 py-1.5 whitespace-nowrap" key={col}>
							<CellContent value={row[col]} />
						</td>
					))}
				</tr>
			))}
			{rows.length === 0 && (
				<tr>
					<td
						className="py-8 text-center text-muted-foreground"
						colSpan={columns.length || 1}>
						No results
					</td>
				</tr>
			)}
		</>
	);
}

function CellContent({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="text-muted-foreground italic">null</span>;
	}
	return <>{stringifyValue(value)}</>;
}

export { SqlResultsTable };
