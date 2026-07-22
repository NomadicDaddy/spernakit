import type { ReactNode } from 'react';

import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

import { Sparkline } from './Sparkline';

interface StatCardTrend {
	/**
	 * Whether an upward movement is a positive signal. Defaults to true (e.g. users,
	 * revenue). Set false for metrics where rising is worse, like resource utilization —
	 * the arrow still reflects the real direction, but the color flips.
	 */
	higherIsBetter?: boolean;
	label: string;
	value: number;
}

interface StatCardSparkline {
	/** Optional color for the sparkline (any CSS color string). */
	color?: string;
	/** Series values ordered oldest → newest. */
	points: number[];
}

interface StatCardProps {
	icon: ReactNode;
	/** Optional index used to stagger the entrance animation in a grid of stat cards. */
	index?: number;
	/** Optional progress value (0-100) to show a progress bar below the value. */
	progress?: number;
	/** Optional inline sparkline rendered below the value to hint at recent trend. */
	sparkline?: StatCardSparkline | undefined;
	/** Optional subtitle text displayed below the value. */
	subtitle?: string;
	title: string;
	/** Optional trend indicator shown below the value. */
	trend?: StatCardTrend | undefined;
	value: number | string;
	/** Optional visual variant for the card. */
	variant?: 'default' | 'destructive' | 'success' | 'warning';
}

const variantCardClasses: Record<string, string> = {
	default: '',
	destructive: 'border-destructive/50 bg-gradient-to-br from-destructive/8 to-card',
	success:
		'border-[oklch(0.723_0.219_149/20%)] bg-gradient-to-br from-[oklch(0.723_0.219_149/8%)] to-card',
	warning:
		'border-[oklch(0.795_0.184_86/20%)] bg-gradient-to-br from-[oklch(0.795_0.184_86/8%)] to-card',
};

const variantIconClasses: Record<string, string> = {
	default: '',
	destructive: 'rounded-xl bg-destructive/10 p-2',
	success: 'rounded-xl bg-[oklch(0.723_0.219_149/15%)] p-2',
	warning: 'rounded-xl bg-[oklch(0.795_0.184_86/15%)] p-2',
};

function TrendIndicator({ trend }: { trend: StatCardTrend }) {
	const Icon = trend.value > 0 ? TrendingUp : trend.value < 0 ? TrendingDown : Minus;
	const higherIsBetter = trend.higherIsBetter ?? true;
	// The icon tracks the raw direction; the color tracks whether that direction is good.
	const goodDirection = higherIsBetter ? trend.value > 0 : trend.value < 0;
	const badDirection = higherIsBetter ? trend.value < 0 : trend.value > 0;
	const color = goodDirection
		? 'text-[oklch(0.723_0.219_149)]'
		: badDirection
			? 'text-destructive'
			: 'text-muted-foreground';

	return (
		<div className={cn('mt-2 flex items-center gap-1', color)}>
			<Icon aria-hidden="true" className="size-4" />
			<span className="text-sm font-medium">{Math.abs(trend.value)}%</span>
			<span className="text-muted-foreground text-xs">{trend.label}</span>
		</div>
	);
}

export function StatCard({
	icon,
	index,
	progress,
	sparkline,
	subtitle,
	title,
	trend,
	value,
	variant = 'default',
}: StatCardProps) {
	const hasVariant = variant !== 'default';

	return (
		<Card
			className={cn(
				'animate-fade-up',
				variantCardClasses[variant],
				hasVariant && 'transition-transform duration-200 hover:scale-[1.02]'
			)}
			style={index !== undefined ? { animationDelay: `${index * 40}ms` } : undefined}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{title}</CardTitle>
				<div className={cn(variantIconClasses[variant])}>{icon}</div>
			</CardHeader>
			<CardContent className={progress !== undefined ? 'space-y-2' : undefined}>
				<div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
				{subtitle && <p className="text-muted-foreground text-xs">{subtitle}</p>}
				{trend && <TrendIndicator trend={trend} />}
				{sparkline && sparkline.points.length > 1 && (
					<Sparkline
						className="mt-3"
						color={sparkline.color ?? 'currentColor'}
						points={sparkline.points}
					/>
				)}
				{progress !== undefined && <Progress value={progress} />}
			</CardContent>
		</Card>
	);
}
