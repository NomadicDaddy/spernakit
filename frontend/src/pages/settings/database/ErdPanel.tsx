import { useQuery } from '@tanstack/react-query';
import { Minus, Plus, Scan } from 'lucide-react';
import { useRef, useState } from 'react';

import type { TableMetadata } from '@/api/databaseAdmin';

import { getRelationships, getSchema } from '@/api/databaseAdmin';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';

import type { NodePosition } from './ErdGraphPrimitives';

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
const NODE_ROW_HEIGHT = 18;
const GRID_COLS = 4;
const GRID_GAP_X = 240;
const GRID_GAP_Y = 40;
const SVG_PADDING = 20;
const MIN_ZOOM = 0.35;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.15;

function computeLayout(tables: TableMetadata[]): Map<string, NodePosition> {
	const positions = new Map<string, NodePosition>();

	tables.forEach((table, i) => {
		const col = i % GRID_COLS;
		const row = Math.floor(i / GRID_COLS);
		const height =
			NODE_HEADER_HEIGHT + NODE_PADDING + table.columnCount * NODE_ROW_HEIGHT + NODE_PADDING;

		positions.set(table.tableName, {
			height,
			width: NODE_WIDTH,
			x: SVG_PADDING + col * GRID_GAP_X,
			y: SVG_PADDING + row * (200 + GRID_GAP_Y),
		});
	});

	return positions;
}

function ErdPanel({ onSelectTable }: ErdPanelProps) {
	const [activeTable, setActiveTable] = useState<null | string>(null);
	const [zoom, setZoom] = useState(1);
	const graphViewportRef = useRef<HTMLDivElement>(null);

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
	const positions = computeLayout(tables);

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
		const heightScale = Math.min(window.innerHeight * 0.58, 640) / svgHeight;
		setZoom(Math.min(1, Math.max(MIN_ZOOM, Math.min(widthScale, heightScale))));
		viewport.scrollTo({ behavior: 'smooth', left: 0, top: 0 });
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between pb-3">
				<CardTitle className="text-base">Entity Relationship Diagram</CardTitle>
				<div
					aria-label="Diagram view controls"
					className="flex items-center gap-1"
					role="toolbar">
					<DiagramControl
						disabled={zoom <= MIN_ZOOM}
						label="Zoom out"
						onClick={() => changeZoom(-ZOOM_STEP)}>
						<Minus aria-hidden="true" />
					</DiagramControl>
					<span
						aria-live="polite"
						className="min-w-11 text-center text-xs text-muted-foreground">
						{Math.round(zoom * 100)}%
					</span>
					<DiagramControl
						disabled={zoom >= MAX_ZOOM}
						label="Zoom in"
						onClick={() => changeZoom(ZOOM_STEP)}>
						<Plus aria-hidden="true" />
					</DiagramControl>
					<DiagramControl label="Fit diagram to view" onClick={fitToView}>
						<Scan aria-hidden="true" />
					</DiagramControl>
				</div>
			</CardHeader>
			<CardContent className="max-h-[min(70vh,720px)] overflow-auto" ref={graphViewportRef}>
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

function DiagramControl({
	children,
	disabled = false,
	label,
	onClick,
}: {
	children: React.ReactNode;
	disabled?: boolean;
	label: string;
	onClick: () => void;
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					aria-label={label}
					disabled={disabled}
					onClick={onClick}
					size="icon-sm"
					variant="outline">
					{children}
				</Button>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	);
}

export { ErdPanel };
