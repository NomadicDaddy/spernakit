import { ShieldCheck } from 'lucide-react';

import type { HealthAlert } from '@/api/health';

import { EmptyState } from '@/components/shared/EmptyState';
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
				<CardTitle as="h3">Active Alerts</CardTitle>
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
					/*
					 * The shared empty state, not a bare sentence. /settings/system-health said
					 * "nothing to report" twice on one screen at two different ranks — the Web
					 * Vitals panel through EmptyState, this one as 14px muted body copy — so the
					 * same fact looked like two different kinds of thing.
					 */
					<EmptyState
						description="Health checks are passing; alerts appear here when one fails."
						frame="none"
						headingLevel="h4"
						icon={ShieldCheck}
						title="No active alerts"
						variant="compact"
					/>
				)}
			</CardContent>
		</Card>
	);
}
