import type { HealthCheck } from '@/api/health';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';

import { CheckCard } from './CheckCard';

interface HealthChecksSectionProps {
	details: { checks: HealthCheck[] } | undefined;
	detailsLoading: boolean;
	runCheckMutation: {
		isPending: boolean;
		mutate: (checkName: string) => void;
		/** The checkType currently in flight, so pending state is scoped to the row that caused it. */
		variables?: string | undefined;
	};
}

export function HealthChecksSection({
	details,
	detailsLoading,
	runCheckMutation,
}: HealthChecksSectionProps) {
	return (
		<div className="space-y-3">
			<SectionHeader
				description="Each check and the last result it reported."
				level="h3"
				title="Health Checks"
			/>
			{detailsLoading ? (
				<ContentListSkeleton lineHeight="h-16" spacing="space-y-2" />
			) : (
				<div className="space-y-2">
					{details?.checks?.map((check) => (
						<CheckCard
							check={check}
							isRunning={
								runCheckMutation.isPending &&
								runCheckMutation.variables === check.checkType
							}
							key={check.checkType}
							onRun={(checkType) => void runCheckMutation.mutate(checkType)}
							runDisabled={runCheckMutation.isPending}
						/>
					))}
				</div>
			)}
		</div>
	);
}
