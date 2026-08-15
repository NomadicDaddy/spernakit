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
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useAuthorization } from '@/hooks/useAuthorization';
import { cn } from '@/lib/utils';

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

				{/*
				 * A real Card + CardFooter, so the form ends on the plane the rest of the surface
				 * uses. At `md` and up the Save button was a bare child of the <form>, painted at
				 * x=660 on the raw page background in the 24px gap between the Auth Rate Limiting
				 * card and the OAuth card — the only primary action on any settings or profile
				 * surface sitting outside a card. Three more cards follow it that it does not
				 * govern, and the OAuth card commits on blur rather than on save, so nothing on
				 * screen marked where the form ended. The card edge is that boundary now, the same
				 * way SecurityTab's CardFooter bounds the password form.
				 *
				 * Axes set where the padding contract puts them (`py-*` on Card, `px-*` on
				 * CardFooter) and tightened below `md`: the default `py-6`/`px-6` would spend 48px
				 * of an 844px viewport on a two-control row that the mobile pass had already tuned
				 * down to 8px.
				 *
				 * Sticky below `md` while the form is dirty, in the shape of the /settings/users bulk
				 * bar — same `bottom-4`, same card surface, same `flex-wrap gap-y-2`.
				 *
				 * This form is 12 settings and 2652px against an 844px viewport, and its only commit
				 * control sat at y=1889 — 71% of the way down, past eleven unrelated controls, with
				 * nothing along the way saying a change was pending. Sticky rather than fixed is what
				 * answers the "does it cover the last control" question: the bar still occupies real
				 * flow space at the end of the form, so it floats while scrolling and then settles
				 * into the gap it always had, and no scroll container needs compensating padding.
				 *
				 * Pinned only when dirty. A bar pinned permanently spends 56px of an 844px viewport
				 * to say nothing, and the disabled button that used to be here said it in place.
				 * Only the *pinning* is dirty-gated now — the card surface is unconditional,
				 * because a footer that materialises on first keystroke is the boundary appearing
				 * at the moment it stops being needed. Discard sits beside Save because a bar that
				 * can only commit turns a mis-tap into a decision the user cannot back out of;
				 * `form.reset()` is the same call the mutation makes on success, so there is no
				 * second notion of "clean".
				 *
				 * At `md` and up it settles back into the flow as an ordinary footer card: at
				 * 1440x900 the form is 1.4 viewports and the control was never hard to find.
				 */}
				<Card
					className={cn('py-2 md:py-4', form.dirty && 'sticky bottom-4 z-20 md:static')}>
					<CardFooter className="flex flex-wrap items-center gap-2 gap-y-2 px-4 md:px-6">
						{form.dirty && (
							<span className="text-sm text-muted-foreground md:hidden">
								Unsaved changes
							</span>
						)}
						{/*
						 * The two buttons wrap as a pair, not individually. Flat, the three items are
						 * 110 + 123 + 83px plus gaps against 295px of content width at 390, so the row
						 * broke three ways and the bar stood 98px tall — 12% of the viewport to hold two
						 * controls. Kept together they take one 214px line under the label, and on a
						 * wider phone the whole bar collapses back to a single line on its own.
						 */}
						<div className="flex flex-wrap items-center gap-2 gap-y-2">
							<Button disabled={!form.dirty || mutation.isPending} type="submit">
								{mutation.isPending ? 'Saving…' : 'Save Settings'}
							</Button>
							{form.dirty && (
								<Button
									disabled={mutation.isPending}
									onClick={form.reset}
									type="button"
									variant="ghost">
									Discard
								</Button>
							)}
						</div>
					</CardFooter>
				</Card>
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
