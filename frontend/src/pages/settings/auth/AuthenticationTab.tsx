import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import {
	type AuthSecuritySettings,
	getAuthSecuritySettings,
	getSecurityHealth,
	updateAuthSecuritySettings,
} from '@/api/authSecurity';
import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { UnsavedChangesGuard } from '@/components/shared/UnsavedChangesGuard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthorization } from '@/hooks/useAuthorization';

import { AccountLockoutSection } from './AccountLockoutSection';
import { AuthRateLimitSection } from './AuthRateLimitSection';
import { BackupKeyRotationSection } from './BackupKeyRotationSection';
import { OAuthProvidersSection } from './OAuthProvidersSection';
import { PasswordPolicySection } from './PasswordPolicySection';
import { SecurityHealthSection } from './SecurityHealthSection';
import { SelfRegistrationSection } from './SelfRegistrationSection';
import { useAuthenticationForm } from './useAuthenticationForm';

function AuthenticationTab() {
	const queryClient = useQueryClient();
	const { data, isLoading } = useQuery({
		queryFn: getAuthSecuritySettings,
		queryKey: ['authSecurity'],
	});
	const { can } = useAuthorization();
	const canManageAuth = can('SYSOP');
	const canViewHealth = can('ADMIN');

	const { data: healthData, isLoading: healthLoading } = useQuery({
		enabled: canViewHealth,
		queryFn: getSecurityHealth,
		queryKey: ['securityHealth'],
	});
	const serverData = data?.data;
	const form = useAuthenticationForm(serverData);

	const mutation = useMutation({
		mutationFn: async (settings: Partial<AuthSecuritySettings>) => {
			return updateAuthSecuritySettings(settings);
		},
		onSuccess: () => {
			toast.success('Authentication security settings saved');
			form.reset();
			void queryClient.invalidateQueries({ queryKey: ['authSecurity'] });
		},
	});

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!serverData) return;

		const updates = form.getUpdates();
		if (Object.keys(updates).length === 0) return;
		mutation.mutate(updates);
	}

	if (isLoading) {
		return <CardSkeleton contentLines={6} titleWidth="h-6 w-40" />;
	}

	if (!canManageAuth) {
		return (
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle>Authentication Security</CardTitle>
						<CardDescription>
							Configure password policies and account lockout rules
						</CardDescription>
					</CardHeader>
					<CardContent>
						<p className="text-sm text-muted-foreground">
							Only SYSOP role can modify authentication security settings.
						</p>
					</CardContent>
				</Card>
				{canViewHealth && (
					<SecurityHealthSection data={healthData?.data} isLoading={healthLoading} />
				)}
			</div>
		);
	}

	return (
		<>
			<UnsavedChangesGuard isDirty={form.dirty} />
			{/*
			 * Four sibling Cards, one per policy group, rather than four bordered boxes inside a
			 * single "Authentication Security" card. The form now wraps the cards instead of living
			 * inside one, so the groups sit on the page's own 24px section rhythm and each carries a
			 * real heading — the previous shape gave a switch and the detail panel it controls the
			 * same 24px separation as two unrelated policies.
			 */}
			<form className="space-y-6" onSubmit={handleSubmit}>
				<AccountLockoutSection
					enableAccountLocking={form.formValues.enableAccountLocking}
					lockoutDurationMinutes={form.formValues.lockoutDurationMinutes}
					maxLoginAttempts={form.formValues.maxLoginAttempts}
					{...form.lockoutActions}
				/>

				<PasswordPolicySection
					minPasswordAgeDays={form.formValues.minPasswordAgeDays}
					passwordExpiryDays={form.formValues.passwordExpiryDays}
					passwordHistoryDepth={form.formValues.passwordHistoryDepth}
					requirePasswordChange={form.formValues.requirePasswordChange}
					requireSpecialCharacter={form.formValues.requireSpecialCharacter}
					{...form.policyActions}
				/>

				<SelfRegistrationSection
					selfRegistrationEnabled={form.formValues.selfRegistrationEnabled}
					{...form.selfRegistrationActions}
				/>

				<AuthRateLimitSection
					authRateLimitEnabled={form.formValues.authRateLimitEnabled}
					authRateLimitMaxRequests={form.formValues.authRateLimitMaxRequests}
					authRateLimitWindowMinutes={form.formValues.authRateLimitWindowMinutes}
					{...form.rateLimitActions}
				/>

				<Button disabled={!form.dirty || mutation.isPending} type="submit">
					{mutation.isPending ? 'Saving…' : 'Save Settings'}
				</Button>
			</form>
			<OAuthProvidersSection />
			<BackupKeyRotationSection />
			{canViewHealth && (
				<SecurityHealthSection data={healthData?.data} isLoading={healthLoading} />
			)}
		</>
	);
}

export { AuthenticationTab };
