import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormatters } from '@/hooks/useFormatters';
import { cn } from '@/lib/utils';

import { statusBadgeClassName, statusIcon } from './healthStatusUtils';

interface HealthHistorySectionProps {
	historyData: { history: unknown[] } | undefined;
	historyLoading: boolean;
}

export function HealthHistorySection({ historyData, historyLoading }: HealthHistorySectionProps) {
	const { formatDateTime } = useFormatters();
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Recent History</CardTitle>
				<CardDescription>Last 50 health check results.</CardDescription>
			</CardHeader>
			<CardContent>
				{historyLoading ? (
					<Skeleton className="h-40 w-full" />
				) : historyData?.history && historyData.history.length > 0 ? (
					<div className="max-h-64 space-y-1 overflow-y-auto">
						{historyData.history.map((entry: unknown) => {
							const historyEntry = entry as {
								checkType: string;
								createdAt: string;
								durationMs: null | number;
								id: number;
								status: string;
							};
							return (
								<div
									className="flex items-center gap-3 rounded px-2 py-1.5 text-sm"
									key={historyEntry.id}>
									{statusIcon(historyEntry.status)}
									<span className="w-24 capitalize">
										{historyEntry.checkType}
									</span>
									<Badge
										className={cn(
											statusBadgeClassName(historyEntry.status),
											'text-xs'
										)}>
										{historyEntry.status}
									</Badge>
									<span className="text-muted-foreground text-xs">
										{historyEntry.durationMs !== null
											? `${historyEntry.durationMs}ms`
											: '-'}
									</span>
									<span className="text-muted-foreground ml-auto text-xs">
										{formatDateTime(historyEntry.createdAt)}
									</span>
								</div>
							);
						})}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">
						No health check history yet. Click Refresh to run checks.
					</p>
				)}
			</CardContent>
		</Card>
	);
}
