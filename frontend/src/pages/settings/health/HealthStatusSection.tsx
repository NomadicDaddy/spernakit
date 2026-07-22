import { Activity } from 'lucide-react';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

import { statusBadgeClassName } from './healthStatusUtils';

interface HealthStatusSectionProps {
	details: { status: string; timestamp: string } | undefined;
	detailsLoading: boolean;
}

export function HealthStatusSection({ details, detailsLoading }: HealthStatusSectionProps) {
	return (
		<>
			{detailsLoading ? (
				<ContentListSkeleton lineCount={1} lineHeight="h-16" />
			) : details?.status ? (
				<Card>
					<CardContent className="flex items-center gap-4 p-4">
						<Activity aria-hidden="true" className="size-6" />
						<div className="flex-1">
							<p className="text-sm font-medium">Overall Status</p>
							<p className="text-muted-foreground text-xs">{details.timestamp}</p>
						</div>
						<Badge className={statusBadgeClassName(details.status)}>
							{details.status}
						</Badge>
					</CardContent>
				</Card>
			) : null}
		</>
	);
}
