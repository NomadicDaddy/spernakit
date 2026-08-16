import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Columns3, Search } from 'lucide-react';
import { useDeferredValue, useEffect, useRef, useState } from 'react';

import { getSchema, getTableDetails } from '@/api/databaseAdmin';
import { EmptyState } from '@/components/shared/EmptyState';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';
import { scrollIntoViewWithin } from '@/lib/scrollIntoViewWithin';

import { ColumnList, TableRow } from './SchemaExplorerRows';

/**
 * The scroll cap shared by both lists, in the viewport-relative idiom the ERD panel already uses.
 *
 * A fixed `max-h-[500px]` was a cap chosen against no particular screen, and on a tall one it was
 * the thing keeping the lists short: at 1200px of viewport the cards had 654px of room and showed
 * 500px of a 1088px list, leaving a large empty band below and 11 of 26 tables reachable without
 * scrolling. `22rem` is the page chrome above and below these cards — header, tab rails, page
 * heading, card headers, footer padding — so the cap tracks the window instead of ignoring it.
 *
 * `min-h` is the floor for short windows, where `100vh - 22rem` would collapse to a few rows. It
 * beats `max-h` in the CSS cascade, so the pair reads as `max(24rem, 100vh - 22rem)`.
 *
 * Both cards get the identical value, which is what keeps them the same height: they are grid
 * siblings whose content both overruns the cap, so both land exactly on it.
 */
const SCHEMA_LIST_HEIGHT = 'max-h-[calc(100vh-22rem)] min-h-[24rem]';

interface SchemaExplorerPanelProps {
	onSelectTable?: ((tableName: string) => void) | undefined;
	selectedTable?: string | undefined;
}

function SchemaExplorerPanel({ onSelectTable, selectedTable }: SchemaExplorerPanelProps) {
	const [search, setSearch] = useState('');
	const [hasMoreTablesBelow, setHasMoreTablesBelow] = useState(false);
	const tableListRef = useRef<HTMLDivElement>(null);
	const detailsCardRef = useRef<HTMLDivElement>(null);

	const { data: schemaResponse, isLoading: isLoadingSchema } = useQuery({
		queryFn: getSchema,
		queryKey: ['database-admin', 'schema'],
		staleTime: STALE_TIME_SHORT,
	});

	const { data: detailsResponse, isLoading: isLoadingDetails } = useQuery({
		enabled: !!selectedTable,
		queryFn: () => getTableDetails(selectedTable!),
		queryKey: ['database-admin', 'table', selectedTable],
		staleTime: STALE_TIME_SHORT,
	});

	const tables = schemaResponse?.data ?? [];
	const details = detailsResponse?.data;

	const deferredSearch = useDeferredValue(search);
	const filteredTables = deferredSearch
		? tables.filter((t) => t.tableName.toLowerCase().includes(deferredSearch.toLowerCase()))
		: tables;

	useEffect(() => {
		const list = tableListRef.current;
		if (!list) return;

		const updateOverflowCue = () => {
			setHasMoreTablesBelow(list.scrollTop + list.clientHeight < list.scrollHeight - 2);
		};
		updateOverflowCue();
		const observer = new ResizeObserver(updateOverflowCue);
		observer.observe(list);
		return () => observer.disconnect();
	}, [filteredTables.length, isLoadingSchema]);

	/*
	 * Below `md` the two cards stack, so the details card starts a full list-height below the row
	 * that was just tapped — off screen, every time. Tapping a table changed the card title and
	 * filled it with columns and the user saw none of it: the tap produced no observable result at
	 * all, which reads as a dead control rather than a slow one.
	 *
	 * `scrollIntoViewWithin` rather than `Element.scrollIntoView` because the latter scrolls every
	 * scrollable ancestor, and the tab rail above this panel is one of them — see
	 * remediation-20260815-mobile-tablayout-scroll-jack for that defect in its own right.
	 *
	 * At `md` and up the details card is the grid sibling beside the list and is already in view, so
	 * scrolling there would move the page out from under a user who can see the answer already.
	 */
	useEffect(() => {
		const card = detailsCardRef.current;
		if (!selectedTable || !card) return;
		if (window.matchMedia('(min-width: 48rem)').matches) return;
		scrollIntoViewWithin(card, { offset: 8 });
	}, [selectedTable]);

	return (
		/*
		 * `grid-cols-1` and `minmax(0,1fr)` are both load-bearing. With no base column this grid
		 * had one implicit `auto` track, whose automatic minimum is its content's min-content size
		 * — a definite container width does not clamp that. The track computed to 390.30px inside
		 * a 334px container at 360px wide, and the column widths inside the schema table (which
		 * `whitespace-nowrap` forbids from wrapping) set the floor. Bare `1fr` at `md` is shorthand
		 * for `minmax(auto,1fr)` and carries the identical floor, so it is spelled out here.
		 */
		<div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(2,minmax(0,1fr))]">
			{/* Table List */}
			<Card className="min-w-0">
				<CardHeader className="pb-3">
					{/*
					 * Plain text, like the other three. This surface has four panel card titles —
					 * Tables, Select a table, Entity Relationship Diagram, SQL Query — and this was the
					 * only one carrying a glyph. The panel rail directly above already gives all four
					 * an icon, so the rail is where the iconography lives; repeating it on one card
					 * header out of four read as an oversight rather than as emphasis.
					 */}
					<CardTitle>Tables ({tables.length})</CardTitle>
					<div className="relative">
						<Search
							aria-hidden="true"
							className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground"
						/>
						<Input
							aria-label="Filter tables"
							autoComplete="off"
							className="pl-8"
							onChange={(e) => setSearch(e.target.value)}
							placeholder="Filter tables…"
							value={search}
						/>
					</div>
				</CardHeader>
				<div className="relative">
					<CardContent
						className={`${SCHEMA_LIST_HEIGHT} space-y-1 overflow-y-auto`}
						onScroll={() => {
							const list = tableListRef.current;
							if (list) {
								setHasMoreTablesBelow(
									list.scrollTop + list.clientHeight < list.scrollHeight - 2,
								);
							}
						}}
						ref={tableListRef}>
						{isLoadingSchema ? (
							<ContentListSkeleton
								lineCount={8}
								lineHeight="h-10"
								spacing="space-y-2"
							/>
						) : (
							filteredTables.map((table) => (
								<TableRow
									isSelected={selectedTable === table.tableName}
									key={table.tableName}
									onSelect={() => onSelectTable?.(table.tableName)}
									table={table}
								/>
							))
						)}
						{!isLoadingSchema && filteredTables.length === 0 && (
							<p className="py-4 text-center text-sm text-muted-foreground">
								No tables found
							</p>
						)}
					</CardContent>
					{hasMoreTablesBelow && (
						<div className="pointer-events-none absolute right-0 bottom-0 left-0 flex h-12 items-end justify-center bg-linear-to-t from-card via-card/90 to-transparent pb-1 text-xs text-muted-foreground">
							<span className="flex items-center gap-1 rounded-full border bg-card px-2 py-0.5 shadow-sm">
								More tables below
								<ChevronDown aria-hidden="true" className="size-3" />
							</span>
						</div>
					)}
				</div>
			</Card>

			{/* Column Details */}
			<Card className="min-w-0" ref={detailsCardRef}>
				<CardHeader className="pb-3">
					<CardTitle>
						{selectedTable ? `Columns: ${selectedTable}` : 'Select a table'}
					</CardTitle>
				</CardHeader>
				<CardContent className={`${SCHEMA_LIST_HEIGHT} overflow-y-auto`}>
					{/*
					 * A 654px card holding one muted sentence is the exact case EmptyState's own
					 * docblock names. `compact` because it sits inside a card that already has a
					 * header, not as the whole page.
					 */}
					{!selectedTable && (
						<EmptyState
							description="Pick a table from the list to inspect its columns, types, and foreign keys."
							headingLevel="h3"
							icon={Columns3}
							title="No table selected"
							variant="compact"
						/>
					)}
					{selectedTable && isLoadingDetails && (
						<ContentListSkeleton lineCount={5} lineHeight="h-12" spacing="space-y-2" />
					)}
					{details && (
						<ColumnList columns={details.columns} foreignKeys={details.foreignKeys} />
					)}
				</CardContent>
			</Card>
		</div>
	);
}

export { SchemaExplorerPanel };
