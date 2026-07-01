import { CheckCircle2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface HealthCleanupSectionProps {
	cleanupAlertsMutation: {
		isPending: boolean;
		mutate: () => void;
	};
	cleanupLogsMutation: {
		isPending: boolean;
		mutate: () => void;
	};
}

export function HealthCleanupSection({
	cleanupAlertsMutation,
	cleanupLogsMutation,
}: HealthCleanupSectionProps) {
	const [showCleanupLogsConfirm, setShowCleanupLogsConfirm] = useState(false);
	const [showResolveAlertsConfirm, setShowResolveAlertsConfirm] = useState(false);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Cleanup Actions</CardTitle>
				<CardDescription>
					Cleanup old health check logs and resolve stale alerts.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<div className="flex gap-2">
					<Button
						disabled={cleanupLogsMutation.isPending}
						onClick={() => setShowCleanupLogsConfirm(true)}
						variant="outline">
						<Trash2 aria-hidden="true" className="mr-2 size-4" />
						Cleanup Old Logs
					</Button>
					<Button
						disabled={cleanupAlertsMutation.isPending}
						onClick={() => setShowResolveAlertsConfirm(true)}
						variant="outline">
						<CheckCircle2 aria-hidden="true" className="mr-2 size-4" />
						Resolve Stale Alerts
					</Button>
				</div>
			</CardContent>

			<ConfirmAlertDialog
				confirmText="Purge Logs"
				description="Are you sure you want to purge old health check logs? This action cannot be undone."
				isOpen={showCleanupLogsConfirm}
				isPending={cleanupLogsMutation.isPending}
				onConfirm={() => {
					cleanupLogsMutation.mutate();
					setShowCleanupLogsConfirm(false);
				}}
				onOpenChange={setShowCleanupLogsConfirm}
				title="Purge Health Check Logs"
			/>

			<ConfirmAlertDialog
				confirmText="Resolve All"
				description="Are you sure you want to resolve all stale health check alerts? This will bulk-resolve every alert that is no longer active."
				isOpen={showResolveAlertsConfirm}
				isPending={cleanupAlertsMutation.isPending}
				onConfirm={() => {
					cleanupAlertsMutation.mutate();
					setShowResolveAlertsConfirm(false);
				}}
				onOpenChange={setShowResolveAlertsConfirm}
				title="Resolve Stale Alerts"
			/>
		</Card>
	);
}
