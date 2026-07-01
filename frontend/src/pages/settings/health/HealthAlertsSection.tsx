import type { HealthAlert } from '@/api/health';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

import { AlertCard } from './AlertCard';

interface HealthAlertsSectionProps {
	historyData: { alerts: HealthAlert[] } | undefined;
	historyLoading: boolean;
}

export function HealthAlertsSection({ historyData, historyLoading }: HealthAlertsSectionProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Active Alerts</CardTitle>
				<CardDescription>Unresolved health check alerts.</CardDescription>
			</CardHeader>
			<CardContent>
				{historyLoading ? (
					<Skeleton className="h-20 w-full" />
				) : historyData?.alerts && historyData.alerts.length > 0 ? (
					<div className="space-y-2">
						{historyData.alerts.map((alert) => (
							<AlertCard alert={alert} key={alert.id} />
						))}
					</div>
				) : (
					<p className="text-muted-foreground text-sm">No active alerts.</p>
				)}
			</CardContent>
		</Card>
	);
}
