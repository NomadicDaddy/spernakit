import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Scan } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { TableMetadata } from '@/api/databaseAdmin';

import { getRelationships, getSchema } from '@/api/databaseAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useContainerWidth } from '@/hooks/useContainerWidth';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';

import type { NodePosition } from './ErdGraphPrimitives';

import { ErdDiagramControl } from './ErdDiagramControl';
import {
	NODE_HEADER_HEIGHT,
	NODE_PADDING,
	RelationshipLine,
	TableNode,
} from './ErdGraphPrimitives';

interface ErdPanelProps {
	onSelectTable?: ((tableName: string) => void) | undefined;
}

/** Table node dimensions and layout constants. */
const NODE_WIDTH = 180;
/**
 * The node's caption line — the `N columns` text `TableNode` draws below the header.
 *
 * Node height used to be `columnCount * 18`, reserving room for column rows the node never drew:
 * the widest table claimed 494px to show a 28px header and one caption, so the canvas was mostly
 * empty and — because `RelationshipLine` anchors at `y + height / 2` — every edge terminated up to
 * 240px below the header it belonged to, in blank space. Sizing the node to what it actually paints
 * puts the edges back on the boxes. The alternative, drawing the columns the old height reserved,
 * would make a 34-column table a 630px node and is a different panel.
 */
const NODE_CAPTION_HEIGHT = 16;
const NODE_HEIGHT = NODE_HEADER_HEIGHT + NODE_PADDING * 2 + NODE_CAPTION_HEIGHT;
const GRID_GAP_X = 240;
const GRID_GAP_Y = 40;
const SVG_PADDING = 20;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.15;

/** Horizontal padding `CardContent` contributes to the measured width — `px-6` on each side. */
const CARD_PADDING_X = 48;

/** Columns to lay out before the container has been measured, and the floor for narrow ones. */
const MIN_GRID_COLS = 2;

/**
 * How many table nodes fit across the card interior at the measured width.
 *
 * The layout used to be a hard-coded four columns, which is a width nobody has: at 1470px of card
 * interior the diagram occupied 960px and letterboxed the remaining third of the card, while the
 * unplaced tables ran off the bottom into a scroll nobody expects a diagram to need. A column
 * costs `GRID_GAP_X`, and the last one needs only `NODE_WIDTH` plus the SVG's own padding, which
 * together happen to come to exactly `GRID_GAP_X` — so the whole thing reduces to how many gaps
 * fit in the interior.
 *
 * `width` is the container's padding box, so the card's own `px-6` comes back off it first.
 */
function getColumnCount(width: number): number {
	return Math.max(MIN_GRID_COLS, Math.floor((width - CARD_PADDING_X) / GRID_GAP_X));
}

/**
 * The height the diagram gets to fit into, which is not the height the host currently has.
 *
 * The host is content-sized between its floor and its cap, so on a tall window `clientHeight` is
 * the diagram's own height — fitting against that shrinks a diagram that already fits to 97%, and
 * again on the next click. The cap is the real bound, and `min-h` is what it comes to on a short
 * window, where the floor wins in the cascade.
 */
function getAvailableHeight(viewport: HTMLDivElement): number {
	const { maxHeight, minHeight } = getComputedStyle(viewport);
	const cap = Number.parseFloat(maxHeight) || viewport.clientHeight;
	const floor = Number.parseFloat(minHeight) || 0;
	return Math.max(cap, floor);
}

function computeLayout(tables: TableMetadata[], columnCount: number): Map<string, NodePosition> {
	const positions = new Map<string, NodePosition>();

	tables.forEach((table, i) => {
		const col = i % columnCount;
		const row = Math.floor(i / columnCount);

		positions.set(table.tableName, {
			height: NODE_HEIGHT,
			width: NODE_WIDTH,
			x: SVG_PADDING + col * GRID_GAP_X,
			y: SVG_PADDING + row * (NODE_HEIGHT + GRID_GAP_Y),
		});
	});

	return positions;
}

function ErdPanel({ onSelectTable }: ErdPanelProps) {
	const [activeTable, setActiveTable] = useState<null | string>(null);
	const [zoom, setZoom] = useState(1);
	const graphViewportRef = useRef<HTMLDivElement | null>(null);
	const [measureViewport, viewportWidth] = useContainerWidth();

	/*
	 * One element, two things to hold onto it: the layout needs its width on every resize, and
	 * `fitToView` needs the element itself to scroll it. `useContainerWidth` hands back a callback
	 * ref, so the ref object is populated alongside it rather than competing for the `ref` prop.
	 * Returning a cleanup is what tells React 19 not to call this back with `null` on unmount.
	 */
	const attachViewport = useCallback(
		(element: HTMLDivElement) => {
			graphViewportRef.current = element;
			const stopMeasuring = measureViewport(element);
			return () => {
				if (typeof stopMeasuring === 'function') stopMeasuring();
				graphViewportRef.current = null;
			};
		},
		[measureViewport],
	);

	const { data: schemaResponse, isLoading: isLoadingSchema } = useQuery({
		queryFn: getSchema,
		queryKey: ['database-admin', 'schema'],
		staleTime: STALE_TIME_SHORT,
	});

	const { data: relResponse, isLoading: isLoadingRels } = useQuery({
		queryFn: getRelationships,
		queryKey: ['database-admin', 'relationships'],
		staleTime: STALE_TIME_SHORT,
	});

	const tables = schemaResponse?.data ?? [];
	const relationships = relResponse?.data ?? [];
	const positions = computeLayout(tables, getColumnCount(viewportWidth));

	const isLoading = isLoadingSchema || isLoadingRels;

	// Compute SVG dimensions
	let svgWidth = 800;
	let svgHeight = 600;
	for (const pos of positions.values()) {
		svgWidth = Math.max(svgWidth, pos.x + pos.width + SVG_PADDING * 2);
		svgHeight = Math.max(svgHeight, pos.y + pos.height + SVG_PADDING * 2);
	}

	const adjacentTables = new Set<string>();
	if (activeTable) {
		for (const relationship of relationships) {
			if (relationship.sourceTable === activeTable) {
				adjacentTables.add(relationship.targetTable);
			}
			if (relationship.targetTable === activeTable) {
				adjacentTables.add(relationship.sourceTable);
			}
		}
	}

	function changeZoom(delta: number) {
		setZoom((current) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, current + delta)));
	}

	function fitToView() {
		const viewport = graphViewportRef.current;
		if (!viewport) return;
		const widthScale = Math.max(1, viewport.clientWidth - 16) / svgWidth;
		const heightScale = Math.max(1, getAvailableHeight(viewport) - 16) / svgHeight;
		setZoom(Math.min(1, Math.max(MIN_ZOOM, Math.min(widthScale, heightScale))));
		viewport.scrollTo({ behavior: 'smooth', left: 0, top: 0 });
	}

	/*
	 * Fit once, as soon as there is something to fit and a measured box to fit it into.
	 *
	 * `fitToView` only ever ran from the toolbar button, so the panel opened at 1:1 with a canvas
	 * taller than its own host: at 1024x768, twenty-six tables laid out over 1320px inside a 480px
	 * box, the eighteen below the fold reachable only by scrolling the page down to the card and
	 * then scrolling again inside it, with nothing on screen to say that second scroller was there.
	 *
	 * The ref makes it a one-shot, because everything after this belongs to the user: a manual zoom
	 * is not something a later render gets to undo. The effect has no dependency array on purpose —
	 * the guard decides when it fires.
	 */
	const hasFitRef = useRef(false);
	useEffect(() => {
		if (hasFitRef.current || isLoading || viewportWidth === 0 || tables.length === 0) return;
		hasFitRef.current = true;
		fitToView();
	});

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between pb-3">
				<CardTitle>Entity Relationship Diagram</CardTitle>
				<div
					aria-label="Diagram view controls"
					className="flex items-center gap-1"
					role="toolbar">
					<ErdDiagramControl
						disabled={zoom <= MIN_ZOOM}
						label="Zoom out"
						onClick={() => changeZoom(-ZOOM_STEP)}>
						<Minus aria-hidden="true" />
					</ErdDiagramControl>
					<span
						aria-live="polite"
						className="min-w-11 text-center text-xs text-muted-foreground">
						{Math.round(zoom * 100)}%
					</span>
					<ErdDiagramControl
						disabled={zoom >= MAX_ZOOM}
						label="Zoom in"
						onClick={() => changeZoom(ZOOM_STEP)}>
						<Plus aria-hidden="true" />
					</ErdDiagramControl>
					<ErdDiagramControl label="Fit diagram to view" onClick={fitToView}>
						<Scan aria-hidden="true" />
					</ErdDiagramControl>
				</div>
			</CardHeader>
			{/*
			 * The 720px ceiling bound at 1200 and 1309 alike, so the tallest viewports showed the
			 * same 40% of the canvas as a short one while 137px of page sat empty below the card.
			 * `18rem` is the chrome above and below — header, tab rails, page heading, card header,
			 * footer padding — and `min-h` is the floor for short windows, beating `max-h` in the
			 * cascade so the pair reads as `max(28rem, 100vh - 18rem)`. Same idiom as the schema
			 * lists, one rem tighter because this card has no filter input in its header.
			 */}
			{/*
			 * Zooming in past the fit is the one thing that still makes this box scroll, and a
			 * scroll region a mouse can reach but a keyboard cannot is only half a control — so it
			 * takes focus, names itself, and shows a ring when it has focus.
			 */}
			<CardContent
				aria-label="Entity relationship diagram, scrollable"
				className="max-h-[calc(100vh-18rem)] min-h-[28rem] overflow-auto rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				ref={attachViewport}
				role="region"
				tabIndex={0}>
				{isLoading ? (
					<Skeleton className="h-[400px] w-full" />
				) : (
					<svg
						className="min-w-full"
						height={svgHeight * zoom}
						viewBox={`0 0 ${svgWidth} ${svgHeight}`}
						width={svgWidth * zoom}>
						{/* Relationship lines */}
						{relationships.map((rel, i) => (
							<RelationshipLine
								isActive={
									activeTable === rel.sourceTable ||
									activeTable === rel.targetTable
								}
								key={i}
								positions={positions}
								relationship={rel}
							/>
						))}

						{/* Table nodes */}
						{tables.map((table) => {
							const pos = positions.get(table.tableName);
							if (!pos) return null;
							return (
								<TableNode
									isActive={activeTable === table.tableName}
									isAdjacent={adjacentTables.has(table.tableName)}
									key={table.tableName}
									onBlur={() => setActiveTable(null)}
									onClick={() => onSelectTable?.(table.tableName)}
									onFocus={() => setActiveTable(table.tableName)}
									onMouseEnter={() => setActiveTable(table.tableName)}
									onMouseLeave={() => setActiveTable(null)}
									position={pos}
									table={table}
								/>
							);
						})}
					</svg>
				)}
			</CardContent>
		</Card>
	);
}

export { ErdPanel };
