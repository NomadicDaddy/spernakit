import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Rocket } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import {
	completeOnboarding,
	getOnboardingStatus,
	onboardingKeys,
	resetOnboarding,
} from '@/api/onboarding';
import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthorization } from '@/hooks/useAuthorization';

import { OnboardingChecklist } from './OnboardingChecklist';
import { OnboardingCompletionBanner } from './OnboardingCompletionBanner';
import { OnboardingQuickStart } from './OnboardingQuickStart';
import { OnboardingTips } from './OnboardingTips';

function OnboardingPage() {
	const queryClient = useQueryClient();
	const navigate = useNavigate();
	const { isAdmin, isSysop } = useAuthorization();
	const [showResetConfirm, setShowResetConfirm] = useState(false);

	const { data, isLoading } = useQuery({
		queryFn: getOnboardingStatus,
		queryKey: onboardingKeys.status(),
		refetchOnMount: 'always',
	});

	const completeMutation = useMutation({
		mutationFn: completeOnboarding,
		onError: () => toast.error('Failed to complete onboarding. Please try again.'),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
			toast.success(`Onboarding completed! Welcome to ${__APP_NAME__}.`);
			void navigate('/dashboard');
		},
	});

	const resetMutation = useMutation({
		mutationFn: resetOnboarding,
		onError: () => toast.error('Failed to reset onboarding. Please try again.'),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: onboardingKeys.all });
			toast.success('Onboarding has been reset.');
			setShowResetConfirm(false);
		},
	});

	if (isLoading) {
		return (
			<div className="space-y-6 p-6">
				<Skeleton className="h-8 w-64" />
				<Skeleton className="h-4 w-96" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	}

	const status = data?.data;
	const steps = status?.steps ?? [];
	const allComplete = steps.every((s) => s.completed);

	return (
		<div className="space-y-6 p-6">
			<PageHeader
				description={
					status?.isComplete
						? 'Onboarding is complete. You can reset it if needed.'
						: 'Complete these steps to set up your application.'
				}
				title={
					<>
						Welcome to <span translate="no">{__APP_NAME__}</span>
					</>
				}>
				{/*
				 * Page-level administration belongs in the page header, not in the checklist's
				 * footer. Inside the card, "Reset Onboarding" was the only button-weight control in
				 * the whole panel — so the undo action was the loudest thing on the page while the
				 * action it wants you to take was a 14px text link buried mid-row.
				 */}
				{!status?.isComplete && isAdmin() && (
					<>
						<Button
							disabled={resetMutation.isPending}
							onClick={() => setShowResetConfirm(true)}
							size="sm"
							variant="outline">
							Reset Onboarding
						</Button>
						{allComplete && (
							<Button
								disabled={completeMutation.isPending}
								onClick={() => completeMutation.mutate()}
								size="sm">
								<Rocket aria-hidden="true" className="size-4" />
								{completeMutation.isPending ? 'Completing…' : 'Complete Onboarding'}
							</Button>
						)}
					</>
				)}
			</PageHeader>

			{status?.isComplete && (
				<OnboardingCompletionBanner
					completedAt={status.completedAt}
					isResetPending={resetMutation.isPending}
					onReset={() => setShowResetConfirm(true)}
					showReset={isAdmin()}
				/>
			)}

			{!status?.isComplete && <OnboardingChecklist steps={steps} />}

			{!status?.isComplete && <OnboardingQuickStart isSysop={isSysop()} />}

			{!status?.isComplete && <OnboardingTips />}

			<ConfirmAlertDialog
				confirmText="Reset Onboarding"
				description="This will reset all onboarding progress. Your team will need to complete the checklist again."
				isOpen={showResetConfirm}
				isPending={resetMutation.isPending}
				onConfirm={() => resetMutation.mutate()}
				onOpenChange={setShowResetConfirm}
				title="Reset Onboarding"
				variant="destructive"
			/>
		</div>
	);
}

export { OnboardingPage };
