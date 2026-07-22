import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import type { Relationship, TableMetadata } from '@/api/databaseAdmin';

import { getRelationships, getSchema } from '@/api/databaseAdmin';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { STALE_TIME_SHORT } from '@/lib/queryConfig';

interface ErdPanelProps {
	onSelectTable?: ((tableName: string) => void) | undefined;
}

/** Table node dimensions and layout constants. */
const NODE_WIDTH = 180;
const NODE_HEADER_HEIGHT = 28;
const NODE_ROW_HEIGHT = 18;
const NODE_PADDING = 8;
const GRID_COLS = 4;
const GRID_GAP_X = 240;
const GRID_GAP_Y = 40;
const SVG_PADDING = 20;

interface NodePosition {
	height: number;
	width: number;
	x: number;
	y: number;
}

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
	const [hoveredTable, setHoveredTable] = useState<null | string>(null);

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

	return (
		<Card>
			<CardHeader className="pb-3">
				<CardTitle className="text-base">Entity Relationship Diagram</CardTitle>
			</CardHeader>
			<CardContent className="overflow-auto">
				{isLoading ? (
					<Skeleton className="h-[400px] w-full" />
				) : (
					<svg
						className="min-w-full"
						height={svgHeight}
						viewBox={`0 0 ${svgWidth} ${svgHeight}`}
						width={svgWidth}>
						{/* Relationship lines */}
						{relationships.map((rel, i) => (
							<RelationshipLine key={i} positions={positions} relationship={rel} />
						))}

						{/* Table nodes */}
						{tables.map((table) => {
							const pos = positions.get(table.tableName);
							if (!pos) return null;
							return (
								<TableNode
									isHovered={hoveredTable === table.tableName}
									key={table.tableName}
									onClick={() => onSelectTable?.(table.tableName)}
									onMouseEnter={() => setHoveredTable(table.tableName)}
									onMouseLeave={() => setHoveredTable(null)}
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

function TableNode({
	isHovered,
	onClick,
	onMouseEnter,
	onMouseLeave,
	position,
	table,
}: {
	isHovered: boolean;
	onClick: () => void;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
	position: NodePosition;
	table: TableMetadata;
}) {
	return (
		<g
			aria-label={`View table ${table.tableName}`}
			className="cursor-pointer"
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === 'Enter' || e.key === ' ') {
					e.preventDefault();
					onClick();
				}
			}}
			onMouseEnter={onMouseEnter}
			onMouseLeave={onMouseLeave}
			role="button"
			tabIndex={0}>
			{/* Background */}
			<rect
				className={isHovered ? 'fill-primary/5' : 'fill-card'}
				height={position.height}
				rx={6}
				stroke={isHovered ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
				strokeWidth={isHovered ? 2 : 1}
				width={position.width}
				x={position.x}
				y={position.y}
			/>
			{/* Header */}
			<rect
				className="fill-primary/10"
				height={NODE_HEADER_HEIGHT}
				rx={6}
				width={position.width}
				x={position.x}
				y={position.y}
			/>
			{/* Cover bottom corners of header */}
			<rect
				className="fill-primary/10"
				height={6}
				width={position.width}
				x={position.x}
				y={position.y + NODE_HEADER_HEIGHT - 6}
			/>
			{/* Table name */}
			<text
				className="fill-foreground text-[11px] font-semibold"
				dominantBaseline="central"
				x={position.x + 8}
				y={position.y + NODE_HEADER_HEIGHT / 2}>
				{table.tableName}
			</text>
			{/* Row count badge */}
			<text
				className="fill-muted-foreground text-[9px]"
				dominantBaseline="central"
				textAnchor="end"
				x={position.x + position.width - 8}
				y={position.y + NODE_HEADER_HEIGHT / 2}>
				{table.rowCount}
			</text>
			{/* Column count info */}
			<text
				className="fill-muted-foreground text-[10px]"
				dominantBaseline="central"
				x={position.x + 8}
				y={position.y + NODE_HEADER_HEIGHT + NODE_PADDING + 8}>
				{table.columnCount} columns
			</text>
		</g>
	);
}

function RelationshipLine({
	positions,
	relationship,
}: {
	positions: Map<string, NodePosition>;
	relationship: Relationship;
}) {
	const source = positions.get(relationship.sourceTable);
	const target = positions.get(relationship.targetTable);

	if (!source || !target) return null;

	const x1 = source.x + source.width;
	const y1 = source.y + source.height / 2;
	const x2 = target.x;
	const y2 = target.y + target.height / 2;

	// Use curved path for better readability
	const midX = (x1 + x2) / 2;

	return (
		<g>
			<path
				className="stroke-muted-foreground/40"
				d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
				fill="none"
				strokeWidth={1.5}
			/>
			{/* Arrow */}
			<polygon
				className="fill-muted-foreground/40"
				points={`${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}`}
			/>
		</g>
	);
}

export { ErdPanel };
