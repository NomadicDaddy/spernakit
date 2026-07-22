import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

import type { HealthAlert } from '@/api/health';

import { acknowledgeAlert, resolveAlert } from '@/api/health';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/hooks/useFormatters';

interface AlertCardProps {
	alert: HealthAlert;
}

export function AlertCard({ alert }: AlertCardProps) {
	const queryClient = useQueryClient();
	const { formatDateTime } = useFormatters();

	const acknowledgeMutation = useMutation({
		mutationFn: () => acknowledgeAlert(alert.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['health-history'] });
		},
	});

	const resolveMutation = useMutation({
		mutationFn: () => resolveAlert(alert.id),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['health-history'] });
		},
	});

	const isAcknowledged = alert.acknowledgedAt !== null;
	const isResolved = alert.resolvedAt !== null;

	return (
		<div className="flex items-start gap-3 rounded border p-3">
			<AlertTriangle
				aria-hidden="true"
				className={`mt-0.5 size-4 ${
					alert.severity === 'critical' ? 'text-red-500' : 'text-yellow-500'
				}`}
			/>
			<div className="flex-1">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2">
						<span className="text-sm font-medium capitalize">{alert.checkType}</span>
						<Badge
							variant={alert.severity === 'critical' ? 'destructive' : 'secondary'}>
							{alert.severity}
						</Badge>
						{isAcknowledged && (
							<Badge className="text-xs" variant="outline">
								Acknowledged
							</Badge>
						)}
						{isResolved && (
							<Badge className="text-xs" variant="default">
								<CheckCircle2 aria-hidden="true" className="mr-1 size-3" />
								Resolved
							</Badge>
						)}
					</div>
					{!isResolved && (
						<div className="flex gap-1">
							{!isAcknowledged && (
								<Button
									disabled={acknowledgeMutation.isPending}
									onClick={() => void acknowledgeMutation.mutate()}
									size="sm"
									variant="outline">
									Acknowledge
								</Button>
							)}
							<Button
								disabled={resolveMutation.isPending}
								onClick={() => void resolveMutation.mutate()}
								size="sm"
								variant="destructive">
								Resolve
							</Button>
						</div>
					)}
				</div>
				<p className="text-muted-foreground mt-1 text-xs">{alert.message}</p>
				<p className="text-muted-foreground text-xs">{formatDateTime(alert.createdAt)}</p>
			</div>
		</div>
	);
}
