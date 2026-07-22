import type { WebVitalSummary } from '@/api/health';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

function vitalRatingBadgeVariant(
	rating: null | string
): 'default' | 'destructive' | 'outline' | 'secondary' {
	if (!rating) return 'outline';
	if (rating === 'good') return 'default';
	if (rating === 'needs-improvement') return 'secondary';
	return 'destructive';
}

interface VitalCardProps {
	vital: WebVitalSummary;
}

/**
 * CLS is a unitless layout-shift ratio; every other Core Web Vital is a duration.
 * Suffixing all of them with "ms" rendered CLS as "0.05ms".
 */
function formatVital(value: null | number, metricName: string): string {
	if (value === null) return '-';
	return metricName.toUpperCase() === 'CLS' ? String(value) : `${value}ms`;
}

export function VitalCard({ vital }: VitalCardProps) {
	const ratingBadge = vital.latestRating ? (
		<Badge variant={vitalRatingBadgeVariant(vital.latestRating)}>{vital.latestRating}</Badge>
	) : null;

	const displayLatest = formatVital(vital.latest, vital.name);

	return (
		<Card>
			<CardContent className="flex flex-col gap-2 p-4">
				<div className="flex items-center justify-between">
					<p className="text-sm font-medium">{vital.name}</p>
					{ratingBadge}
				</div>
				<div className="space-y-1">
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">p75</span>
						<span className="font-medium tabular-nums">
							{formatVital(vital.p75, vital.name)}
						</span>
					</div>
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">Latest</span>
						<span className="font-medium tabular-nums">{displayLatest}</span>
					</div>
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">Rating</span>
						<span className="font-medium">{vital.latestRating ?? '-'}</span>
					</div>
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground">Threshold</span>
						<span className="font-medium tabular-nums">
							{formatVital(vital.threshold, vital.name)}
						</span>
					</div>
					<div className="mt-1 flex items-center justify-between border-t pt-1 text-xs">
						<span className="text-muted-foreground">Sample Count</span>
						<span className="font-medium tabular-nums">{vital.sampleCount}</span>
					</div>
				</div>
			</CardContent>
		</Card>
	);
}
