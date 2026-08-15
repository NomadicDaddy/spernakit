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
			{/*
			 * The stroke comes from token classes, not an inline `hsl(var(--primary))`.
			 * The theme ships OKLCH values, so wrapping one in hsl() yields invalid CSS and
			 * the browser drops the declaration — which is what left every node bodiless.
			 */}
			<rect
				className={
					isActive || isAdjacent
						? 'fill-primary/5 stroke-primary'
						: 'fill-card stroke-border'
				}
				height={position.height}
				rx={6}
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
			{/*
			 * The header holds the name alone, and the counts moved down to the caption line.
			 *
			 * They used to share this 180px box — name anchored 8px from the left, row count anchored
			 * 8px from the right, neither bounded — so a long name ran straight into its own count:
			 * `scheduled_task_executions777` rendered as one unbroken string at every viewport, and
			 * `user_notification_preferences` overran the node border entirely. Both read as a number
			 * welded to a word, with no way to tell where the name ended.
			 *
			 * The counts also disagreed with the Schema tab one click away, which calls the same two
			 * numbers `N cols` and `N rows`; here one was spelled `columns` and the other was a bare
			 * unlabelled figure, so a reader arriving at the ERD first could not tell whether that
			 * trailing number was rows, columns or foreign keys. One caption, the abbreviated
			 * vocabulary the list already uses, and the collision is gone by construction.
			 *
			 * SVG text has no `text-overflow`, so the name is clipped to the node's inner width. The
			 * `<title>` keeps the full name reachable on hover and to assistive tech, which the
			 * overrun version never was either.
			 */}
			<clipPath id={`erd-node-${table.tableName}`}>
				<rect
					height={NODE_HEADER_HEIGHT}
					width={position.width - 16}
					x={position.x + 8}
					y={position.y}
				/>
			</clipPath>
			<text
				className="fill-foreground text-[11px] font-semibold"
				clipPath={`url(#erd-node-${table.tableName})`}
				dominantBaseline="central"
				x={position.x + 8}
				y={position.y + NODE_HEADER_HEIGHT / 2}>
				<title>{table.tableName}</title>
				{table.tableName}
			</text>
			<text
				className="fill-muted-foreground text-[10px] tabular-nums"
				dominantBaseline="central"
				x={position.x + 8}
				y={position.y + NODE_HEADER_HEIGHT + NODE_PADDING + 8}>
				{table.columnCount} cols · {table.rowCount} row
				{table.rowCount === 1 ? '' : 's'}
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
