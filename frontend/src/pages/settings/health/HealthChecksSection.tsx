import type { HealthCheck } from '@/api/health';

import { SectionHeader } from '@/components/shared/SectionHeader';
import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';

import { CheckCard } from './CheckCard';
import { checkOrderIndex } from './healthStatusUtils';

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
	// Sorted, not as returned. See CHECK_ORDER in healthStatusUtils — the same four checks are
	// listed again in the configuration card's Enabled Checks toggles, and the two lists read in
	// one order now. `toSorted` leaves the query cache's array untouched.
	const checks = details?.checks?.toSorted(
		(a, b) => checkOrderIndex(a.checkType) - checkOrderIndex(b.checkType),
	);

	return (
		<div className="space-y-3">
			<SectionHeader
				description="Each check and the last result it reported."
				level="h3"
				title="Health Checks"
			/>
			{detailsLoading ? (
				/* `spacing` is applied as a bare className, so it carries the same track the loaded
				   grid below uses — otherwise the skeleton drew four full-width bars and the checks
				   snapped into tiles the moment they arrived. `lineCount` matches the four checks the
				   endpoint returns. */
				<ContentListSkeleton
					lineCount={4}
					lineHeight="h-16"
					spacing="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-2"
				/>
			) : (
				/*
				 * Auto-fill, not a stack. Each CheckCard holds a name, a duration, a badge and a Run
				 * button — about 250px of content — and stacking them made four 1472x62 bars at 2560
				 * whose entire middle was empty, with the badge and button marooned a screen away
				 * from the name they belong to. The track floor is what the widest of these rows
				 * needs before the button wraps under the badge; `min(…,100%)` collapses it to one
				 * full-width track on a phone rather than pushing the page sideways, the same guard
				 * the option-card groups use.
				 */
				<div className="grid grid-cols-[repeat(auto-fill,minmax(min(18rem,100%),1fr))] gap-2">
					{checks?.map((check) => (
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
