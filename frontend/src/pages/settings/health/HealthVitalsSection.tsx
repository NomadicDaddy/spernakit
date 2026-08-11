import { Gauge } from 'lucide-react';

import type { WebVitalSummary } from '@/api/health';

import { EmptyState } from '@/components/shared/EmptyState';
import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';

import { VitalCard } from './VitalCard';

interface HealthVitalsSectionProps {
	vitalsData: undefined | WebVitalSummary[];
	vitalsLoading: boolean;
}

export function HealthVitalsSection({ vitalsData, vitalsLoading }: HealthVitalsSectionProps) {
	return (
		<div className="space-y-3">
			<SectionHeader
				description="Field measurements collected from real page loads."
				level="h3"
				title="Core Web Vitals (24h)"
			/>
			{vitalsLoading ? (
				<ContentListSkeleton lineCount={5} lineHeight="h-16" spacing="space-y-2" />
			) : vitalsData && vitalsData.length > 0 ? (
				<div className="space-y-2">
					{vitalsData.map((vital) => (
						<VitalCard key={vital.name} vital={vital} />
					))}
				</div>
			) : (
				<EmptyState
					description="Metrics are collected in production builds."
					headingLevel="h4"
					icon={Gauge}
					title="No Web Vitals data yet"
					variant="compact"
				/>
			)}
		</div>
	);
}
