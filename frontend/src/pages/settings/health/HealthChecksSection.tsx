import { Play } from 'lucide-react';

import type { HealthCheck } from '@/api/health';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Button } from '@/components/ui/button';

import { CheckCard } from './CheckCard';

interface HealthChecksSectionProps {
	details: { checks: HealthCheck[] } | undefined;
	detailsLoading: boolean;
	runCheckMutation: {
		isPending: boolean;
		mutate: (checkName: string) => void;
	};
}

export function HealthChecksSection({
	details,
	detailsLoading,
	runCheckMutation,
}: HealthChecksSectionProps) {
	return (
		<div>
			<h3 className="mb-3 text-sm font-medium">Health Checks</h3>
			{detailsLoading ? (
				<ContentListSkeleton lineHeight="h-16" spacing="space-y-2" />
			) : (
				<div className="space-y-2">
					{details?.checks?.map((check) => (
						<div className="flex items-center gap-2" key={check.checkType}>
							<div className="flex-1">
								<CheckCard check={check} />
							</div>
							<Button
								disabled={runCheckMutation.isPending}
								onClick={() => void runCheckMutation.mutate(check.checkType)}
								size="sm"
								variant="outline">
								<Play aria-hidden="true" className="mr-1 size-3" />
								Run
							</Button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
