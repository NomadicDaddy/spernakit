import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, OctagonAlert, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { HealthAlert } from '@/api/health';
import type { DataResponse } from '@/api/types';

import { getHealthHistory } from '@/api/health';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormatters } from '@/hooks/useFormatters';
import { cn } from '@/lib/utils';

const ALERT_LIMIT = 5;

function severityStyle(severity: HealthAlert['severity']) {
	if (severity === 'critical') {
		return { cls: 'bg-destructive/10 text-destructive', Icon: OctagonAlert };
	}
	return { cls: 'bg-[oklch(0.795_0.184_86/15%)] text-[oklch(0.6_0.18_70)]', Icon: AlertTriangle };
}

function ActiveAlerts({ className }: { className?: string }) {
	const { formatTimestamp } = useFormatters();

	const { data, isLoading } = useQuery<DataResponse<{ alerts: HealthAlert[] }>>({
		queryFn: getHealthHistory,
		queryKey: ['health-history'],
		staleTime: 30_000,
		throwOnError: false,
	});

	const active = (data?.data.alerts ?? [])
		.filter((a) => a.resolvedAt === null)
		.slice(0, ALERT_LIMIT);

	return (
		<Card className={cn('flex flex-col', className)}>
			<CardHeader className="flex flex-row items-center justify-between space-y-0">
				<div className="space-y-1">
					<CardTitle className="text-base">Active alerts</CardTitle>
					<CardDescription>Health issues requiring attention</CardDescription>
				</div>
				<Link
					className="text-primary text-sm font-medium hover:underline"
					to="/settings/system-health">
					View all
				</Link>
			</CardHeader>
			<CardContent className="flex-1">
				{isLoading ? (
					<p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
				) : active.length === 0 ? (
					<div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
						<ShieldCheck
							aria-hidden="true"
							className="size-6 text-[oklch(0.723_0.219_149)]"
						/>
						All systems healthy - no active alerts.
					</div>
				) : (
					<ul className="space-y-2">
						{active.map((alert) => {
							const { cls, Icon } = severityStyle(alert.severity);
							return (
								<li
									className="flex items-start gap-3 rounded-lg border p-3"
									key={alert.id}>
									<span
										className={cn(
											'flex size-7 shrink-0 items-center justify-center rounded-md',
											cls
										)}>
										<Icon aria-hidden="true" className="size-4" />
									</span>
									<div className="min-w-0 flex-1">
										<p className="truncate text-sm font-medium">
											{alert.message}
										</p>
										<p className="text-muted-foreground truncate text-xs">
											{alert.checkType} · {formatTimestamp(alert.createdAt)}
										</p>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</CardContent>
		</Card>
	);
}

export { ActiveAlerts };
