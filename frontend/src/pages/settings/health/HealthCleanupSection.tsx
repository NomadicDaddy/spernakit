import { CheckCircle2, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
				<CardTitle as="h3">Cleanup Actions</CardTitle>
				<CardDescription>
					Cleanup old health check logs and resolve stale alerts.
				</CardDescription>
				{/*
				 * The actions sit in CardAction, the way HealthHistorySection already places its
				 * disclosure control. As a CardContent row they were ~285px of buttons at the left
				 * edge of a 1472px card, and the card spent 156px of height to hold one 36px row —
				 * about 1140px of its interior was empty. Header-only, it matches the Overall Status
				 * card's proportions and the buttons land on the same right edge as the Run buttons
				 * and Refresh above them.
				 *
				 * `flex-wrap`. Button carries `whitespace-nowrap`, correctly — a label broken across
				 * lines reads worse than a wrapped row — so these two are rigid, and unwrapped their
				 * combined width exceeded the 334px card at 360px and pushed "Resolve Stale Alerts"
				 * past the card's clipped edge. The row wraps; the labels do not.
				 */}
				<CardAction className="flex flex-wrap gap-2">
					<Button
						disabled={cleanupLogsMutation.isPending}
						onClick={() => setShowCleanupLogsConfirm(true)}
						variant="outline">
						<Trash2 aria-hidden="true" className="size-4" />
						Cleanup Old Logs
					</Button>
					<Button
						disabled={cleanupAlertsMutation.isPending}
						onClick={() => setShowResolveAlertsConfirm(true)}
						variant="outline">
						<CheckCircle2 aria-hidden="true" className="size-4" />
						Resolve Stale Alerts
					</Button>
				</CardAction>
			</CardHeader>

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
				variant="destructive"
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
