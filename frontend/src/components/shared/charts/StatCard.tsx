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

/**
 * The tint only. The box the tint paints is constant across variants — see ICON_BOX.
 *
 * These used to carry `rounded-xl … p-2` as well, so a card with a variant had a 36px icon chip and
 * a card without one had a bare 20px glyph. On /dashboard that put the single variant card in the
 * Overview grid out of step with the five beside it: at 2560x1440 "System Health" sat at y=308
 * against y=300 for "Total Users", its value at y=368 against y=352, and the whole first row was
 * inflated to 150px against the second row's 134px — one six-card band reading as two mismatched
 * strips. The chip is the card's shape; the tint is the variant's contribution to it.
 */
const variantIconClasses: Record<string, string> = {
	default: '',
	destructive: 'bg-destructive/10',
	success: 'bg-[oklch(0.723_0.219_149/15%)]',
	warning: 'bg-[oklch(0.795_0.184_86/15%)]',
};

/** Constant icon chip: 36px is what `p-2` around the size-5 glyph these cards pass already measured. */
const ICON_BOX = 'flex size-9 shrink-0 items-center justify-center rounded-xl';

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
			{/*
			 * Signed, because the unsigned number reads as a second measurement. The System Metrics
			 * row printed "157% vs 6h ago" directly under a CPU value of "7.6%" in the same "%" glyph,
			 * and direction was carried only by a 16px arrow and a colour — so a red 157% under a
			 * 7.6% reading parses as a CPU figure before it parses as a change. U+2212 rather than a
			 * hyphen: it is the minus that matches the "+" in width and height.
			 */}
			<span className="text-sm font-medium">
				{trend.value > 0 ? '+' : trend.value < 0 ? '−' : ''}
				{Math.abs(trend.value)}%
			</span>
			<span className="text-xs text-muted-foreground">{trend.label}</span>
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
				hasVariant && 'transition-transform duration-200 hover:scale-[1.02]',
			)}
			style={index !== undefined ? { animationDelay: `${index * 40}ms` } : undefined}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				{/*
					`as="div"` on purpose. A stat card's title is the *label* for the number
					underneath it — "Total Users", "Active Sessions" — not a heading for a region
					of the page. Promoting eight of those to headings would fill the document
					outline with the same words the values already say.
				*/}
				<CardTitle as="div" className="text-sm font-medium">
					{title}
				</CardTitle>
				<div className={cn(ICON_BOX, variantIconClasses[variant])}>{icon}</div>
			</CardHeader>
			<CardContent className={progress !== undefined ? 'space-y-2' : undefined}>
				{/*
				 * Tabular figures are for figures. `tabular-nums` was unconditional, so the one
				 * card whose value is a word — System Health, reading "healthy" — rendered its
				 * status in a monospaced-digit face alongside "5" and "79".
				 */}
				<div
					className={cn(
						'text-2xl font-bold tracking-tight',
						typeof value === 'number' && 'tabular-nums',
					)}>
					{value}
				</div>
				{subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
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
