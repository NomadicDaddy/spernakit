import type { WebVitalSummary } from '@/api/health';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Card, CardContent } from '@/components/ui/card';

import { VitalCard } from './VitalCard';

interface HealthVitalsSectionProps {
	vitalsData: undefined | WebVitalSummary[];
	vitalsLoading: boolean;
}

export function HealthVitalsSection({ vitalsData, vitalsLoading }: HealthVitalsSectionProps) {
	return (
		<div>
			<h3 className="mb-3 text-sm font-medium">Core Web Vitals (24h)</h3>
			{vitalsLoading ? (
				<ContentListSkeleton lineCount={5} lineHeight="h-16" spacing="space-y-2" />
			) : vitalsData && vitalsData.length > 0 ? (
				<div className="space-y-2">
					{vitalsData.map((vital) => (
						<VitalCard key={vital.name} vital={vital} />
					))}
				</div>
			) : (
				<Card>
					<CardContent className="p-4">
						<p className="text-muted-foreground text-sm">
							No Web Vitals data yet. Metrics are collected in production builds.
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
