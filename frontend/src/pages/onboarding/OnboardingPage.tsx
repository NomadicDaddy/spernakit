import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, CheckCircle2, LayoutDashboard, Rocket, Shield, Users } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useFormatters } from '@/hooks/useFormatters';

import { OnboardingChecklist } from './OnboardingChecklist';

function QuickStartCard({
	description,
	icon: Icon,
	link,
	title,
}: {
	description: string;
	icon: React.ComponentType<{ 'aria-hidden'?: 'false' | 'true' | boolean; className?: string }>;
	link: string;
	title: string;
}) {
	return (
		<Card className="relative" interactive>
			<CardContent className="flex items-start gap-3 pt-6">
				<Icon aria-hidden="true" className="text-primary mt-0.5 h-5 w-5 shrink-0" />
				<div>
					<p className="font-medium">
						<Link className="after:absolute after:inset-0" to={link}>
							{title}
						</Link>
					</p>
					<p className="text-muted-foreground text-sm">{description}</p>
				</div>
			</CardContent>
		</Card>
	);
}

function TipCard({ text, title }: { text: string; title: string }) {
	return (
		<div className="bg-muted/50 flex items-start gap-3 rounded-lg p-4">
			<BookOpen
				aria-hidden="true"
				className="text-muted-foreground mt-0.5 h-5 w-5 shrink-0"
			/>
			<div>
				<p className="text-sm font-medium">{title}</p>
				<p className="text-muted-foreground text-sm">{text}</p>
			</div>
		</div>
	);
}

function OnboardingCompletionBanner({
	completedAt,
	isResetPending,
	onReset,
	showReset,
}: {
	completedAt: null | string | undefined;
	isResetPending: boolean;
	onReset: () => void;
	showReset: boolean;
}) {
	const { formatDate } = useFormatters();
	return (
		<Card className="border-primary/20 bg-primary/5">
			<CardContent className="flex items-center gap-3 pt-6">
				<CheckCircle2 aria-hidden="true" className="text-primary h-6 w-6 shrink-0" />
				<div className="flex-1">
					<p className="font-medium">Onboarding Complete</p>
					<p className="text-muted-foreground text-sm">
						Completed on {completedAt ? formatDate(completedAt) : 'unknown date'}
					</p>
				</div>
				{showReset && (
					<Button disabled={isResetPending} onClick={onReset} size="sm" variant="outline">
						Reset
					</Button>
				)}
			</CardContent>
		</Card>
	);
}

function OnboardingQuickStart({ isSysop }: { isSysop: boolean }) {
	return (
		<div>
			<h2 className="mb-3 text-lg font-semibold">Quick Start</h2>
			<div className="grid gap-3 sm:grid-cols-2">
				<QuickStartCard
					description="Invite team members and assign roles."
					icon={Users}
					link="/settings/users"
					title="Manage Users"
				/>
				{isSysop && (
					<QuickStartCard
						description="Configure security and authentication settings."
						icon={Shield}
						link="/settings/authentication"
						title="Security Settings"
					/>
				)}
				<QuickStartCard
					description="View the main application dashboard."
					icon={LayoutDashboard}
					link="/dashboard"
					title="View Dashboard"
				/>
			</div>
		</div>
	);
}

function OnboardingTips() {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Tips & Best Practices</CardTitle>
				<CardDescription>Helpful guidance as you set up your application.</CardDescription>
			</CardHeader>
			<CardContent className="space-y-3">
				<TipCard
					text="Change the default sysop password immediately after your first login for security."
					title="Change Default Passwords"
				/>
				<TipCard
					text="Set up roles and permissions before inviting your team to ensure proper access control."
					title="Set Up Roles First"
				/>
				<TipCard
					text="Assign the least-privileged role to each team member. Use VIEWER for read-only access."
					title="Follow Least Privilege"
				/>
			</CardContent>
		</Card>
	);
}

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
				}
			/>

			{status?.isComplete && (
				<OnboardingCompletionBanner
					completedAt={status.completedAt}
					isResetPending={resetMutation.isPending}
					onReset={() => setShowResetConfirm(true)}
					showReset={isAdmin()}
				/>
			)}

			{!status?.isComplete && <OnboardingChecklist steps={steps} />}

			{!status?.isComplete && isAdmin() && (
				<div className="flex items-center justify-end gap-2">
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
							size="lg">
							<Rocket aria-hidden="true" className="mr-2 h-4 w-4" />
							{completeMutation.isPending ? 'Completing…' : 'Complete Onboarding'}
						</Button>
					)}
				</div>
			)}

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
			/>
		</div>
	);
}

export { OnboardingPage };
