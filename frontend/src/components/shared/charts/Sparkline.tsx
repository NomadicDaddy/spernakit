import { useId } from 'react';

import { cn } from '@/lib/utils';

interface SparklineProps {
	className?: string;
	/** Stroke/fill color (any CSS color string). Defaults to the current text color. */
	color?: string;
	/** Series values ordered oldest → newest. Needs at least two points to render. */
	points: number[];
}

const WIDTH = 100;
const HEIGHT = 28;

/**
 * Compact, dependency-free SVG sparkline for inline trend hints inside cards.
 * Renders a smoothed line with a soft gradient fill. Returns nothing when there
 * is too little data to draw a meaningful trend.
 */
function Sparkline({ className, color = 'currentColor', points }: SparklineProps) {
	const gradientId = useId();

	if (points.length < 2) return null;

	const max = Math.max(...points);
	const min = Math.min(...points);
	const span = max - min || 1;
	const stepX = WIDTH / (points.length - 1);

	const coords = points.map((p, i) => {
		const x = i * stepX;
		const y = HEIGHT - ((p - min) / span) * HEIGHT;
		return [x, y] as const;
	});

	const line = coords
		.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`)
		.join(' ');
	const area = `${line} L${WIDTH},${HEIGHT} L0,${HEIGHT} Z`;

	return (
		<svg
			aria-hidden="true"
			className={cn('h-7 w-full', className)}
			preserveAspectRatio="none"
			viewBox={`0 0 ${WIDTH} ${HEIGHT}`}>
			<defs>
				<linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stopColor={color} stopOpacity={0.2} />
					<stop offset="100%" stopColor={color} stopOpacity={0} />
				</linearGradient>
			</defs>
			<path d={area} fill={`url(#${gradientId})`} stroke="none" />
			<path
				d={line}
				fill="none"
				stroke={color}
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth={1.5}
				vectorEffect="non-scaling-stroke"
			/>
		</svg>
	);
}

export { Sparkline };
export type { SparklineProps };
