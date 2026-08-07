import type { Relationship, TableMetadata } from '@/api/databaseAdmin';

const NODE_HEADER_HEIGHT = 28;
const NODE_PADDING = 8;

interface NodePosition {
	height: number;
	width: number;
	x: number;
	y: number;
}

function TableNode({
	isActive,
	isAdjacent,
	onBlur,
	onClick,
	onFocus,
	onMouseEnter,
	onMouseLeave,
	position,
	table,
}: {
	isActive: boolean;
	isAdjacent: boolean;
	onBlur: () => void;
	onClick: () => void;
	onFocus: () => void;
	onMouseEnter: () => void;
	onMouseLeave: () => void;
	position: NodePosition;
	table: TableMetadata;
}) {
	return (
		<g
			aria-label={`View table ${table.tableName}`}
			className="cursor-pointer"
			onBlur={onBlur}
			onClick={onClick}
			onFocus={onFocus}
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
			<rect
				className={isActive || isAdjacent ? 'fill-primary/5' : 'fill-card'}
				height={position.height}
				rx={6}
				stroke={isActive || isAdjacent ? 'hsl(var(--primary))' : 'hsl(var(--border))'}
				strokeWidth={isActive ? 2.5 : isAdjacent ? 1.75 : 1}
				width={position.width}
				x={position.x}
				y={position.y}
			/>
			<rect
				className="fill-primary/10"
				height={NODE_HEADER_HEIGHT}
				rx={6}
				width={position.width}
				x={position.x}
				y={position.y}
			/>
			<rect
				className="fill-primary/10"
				height={6}
				width={position.width}
				x={position.x}
				y={position.y + NODE_HEADER_HEIGHT - 6}
			/>
			<text
				className="fill-foreground text-[11px] font-semibold"
				dominantBaseline="central"
				x={position.x + 8}
				y={position.y + NODE_HEADER_HEIGHT / 2}>
				{table.tableName}
			</text>
			<text
				className="fill-muted-foreground text-[9px]"
				dominantBaseline="central"
				textAnchor="end"
				x={position.x + position.width - 8}
				y={position.y + NODE_HEADER_HEIGHT / 2}>
				{table.rowCount}
			</text>
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
	isActive,
	positions,
	relationship,
}: {
	isActive: boolean;
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
	const midX = (x1 + x2) / 2;

	return (
		<g>
			<title>{`${relationship.sourceTable}.${relationship.sourceColumn} to ${relationship.targetTable}.${relationship.targetColumn}`}</title>
			<path
				className={isActive ? 'stroke-primary' : 'stroke-muted-foreground/55'}
				d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
				fill="none"
				strokeWidth={isActive ? 2.5 : 1.5}
			/>
			<circle
				className={isActive ? 'fill-primary' : 'fill-muted-foreground/60'}
				cx={x1}
				cy={y1}
				r={isActive ? 3.5 : 2.5}
			/>
			<polygon
				className={isActive ? 'fill-primary' : 'fill-muted-foreground/60'}
				points={`${x2},${y2} ${x2 - 6},${y2 - 3} ${x2 - 6},${y2 + 3}`}
			/>
			{isActive && (
				<g>
					<rect
						className="fill-background stroke-border"
						height={18}
						rx={4}
						width={150}
						x={midX - 75}
						y={(y1 + y2) / 2 - 9}
					/>
					<text
						className="fill-foreground text-[9px]"
						dominantBaseline="central"
						textAnchor="middle"
						x={midX}
						y={(y1 + y2) / 2}>
						{relationship.sourceColumn} → {relationship.targetColumn}
					</text>
				</g>
			)}
		</g>
	);
}

export { NODE_HEADER_HEIGHT, NODE_PADDING, RelationshipLine, TableNode };
export type { NodePosition };
