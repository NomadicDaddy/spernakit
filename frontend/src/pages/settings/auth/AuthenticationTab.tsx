import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import {
	getAuthSecuritySettings,
	getSecurityHealth,
	type AuthSecuritySettings,
	updateAuthSecuritySettings,
} from '@/api/authSecurity';
import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

import { AccountLockoutSection } from './AccountLockoutSection';
import { AuthRateLimitSection } from './AuthRateLimitSection';
import { BackupKeyRotationSection } from './BackupKeyRotationSection';
import { OAuthProvidersSection } from './OAuthProvidersSection';
import { PasswordPolicySection } from './PasswordPolicySection';
import { SecurityHealthSection } from './SecurityHealthSection';
import { SelfRegistrationSection } from './SelfRegistrationSection';

/** Typed override map — tracks which fields the user has changed from server values. */
interface FormOverrides {
	authRateLimitEnabled?: boolean;
	authRateLimitMaxRequests?: string;
	authRateLimitWindowMinutes?: string;
	enableAccountLocking?: boolean;
	lockoutDurationMinutes?: string;
	maxLoginAttempts?: string;
	minPasswordAgeDays?: string;
	passwordExpiryDays?: string;
	passwordHistoryDepth?: string;
	requirePasswordChange?: boolean;
	requireSpecialCharacter?: boolean;
	selfRegistrationEnabled?: boolean;
}

const NUMBER_FIELDS = [
	'authRateLimitMaxRequests',
	'authRateLimitWindowMinutes',
	'lockoutDurationMinutes',
	'maxLoginAttempts',
	'minPasswordAgeDays',
	'passwordExpiryDays',
	'passwordHistoryDepth',
] as const;

const BOOLEAN_FIELDS = [
	'authRateLimitEnabled',
	'enableAccountLocking',
	'requirePasswordChange',
	'requireSpecialCharacter',
	'selfRegistrationEnabled',
] as const;

/** Convert string-keyed overrides to typed API payload. */
function buildUpdates(overrides: FormOverrides): Partial<AuthSecuritySettings> {
	const updates: Partial<AuthSecuritySettings> = {};

	for (const key of NUMBER_FIELDS) {
		const value = overrides[key];
		if (value !== undefined) {
			(updates as Record<string, number>)[key] = Number.parseInt(value, 10);
		}
	}

	for (const key of BOOLEAN_FIELDS) {
		const value = overrides[key];
		if (value !== undefined) {
			(updates as Record<string, boolean>)[key] = value;
		}
	}

	return updates;
}

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

	const [overrides, setOverrides] = useState<FormOverrides>({});
	const dirty = Object.keys(overrides).length > 0;
	useUnsavedChanges(dirty);
	const serverData = data?.data;

	/** Resolve a boolean field: overrides > server > default. */
	const bool = (key: keyof FormOverrides, fallback: boolean) =>
		(overrides[key] as boolean | undefined) ??
		(serverData?.[key] as boolean | undefined) ??
		fallback;

	/** Resolve a numeric field as string: overrides > server?.toString() > default. */
	const num = (key: keyof FormOverrides, fallback: string) =>
		(overrides[key] as string | undefined) ??
		(serverData?.[key] as number | undefined)?.toString() ??
		fallback;

	/** Resolved form values: overrides > server > defaults. */
	const formValues = {
		authRateLimitEnabled: bool('authRateLimitEnabled', true),
		authRateLimitMaxRequests: num('authRateLimitMaxRequests', '10'),
		authRateLimitWindowMinutes: num('authRateLimitWindowMinutes', '15'),
		enableAccountLocking: bool('enableAccountLocking', false),
		lockoutDurationMinutes: num('lockoutDurationMinutes', '15'),
		maxLoginAttempts: num('maxLoginAttempts', '5'),
		minPasswordAgeDays: num('minPasswordAgeDays', '0'),
		passwordExpiryDays: num('passwordExpiryDays', '0'),
		passwordHistoryDepth: num('passwordHistoryDepth', '5'),
		requirePasswordChange: bool('requirePasswordChange', false),
		requireSpecialCharacter: bool('requireSpecialCharacter', false),
		selfRegistrationEnabled: bool('selfRegistrationEnabled', true),
	};

	const mutation = useMutation({
		mutationFn: async (settings: Partial<AuthSecuritySettings>) => {
			return updateAuthSecuritySettings(settings);
		},
		onSuccess: () => {
			toast.success('Authentication security settings saved');
			setOverrides({});
			void queryClient.invalidateQueries({ queryKey: ['authSecurity'] });
		},
	});

	/**
	 * Create a typed setter that updates the override for a single field.
	 * Clears the override when the new value matches the server value.
	 */
	function makeSetter<K extends keyof FormOverrides>(key: K) {
		return (value: FormOverrides[K]) => {
			setOverrides((prev) => {
				const serverVal = serverData?.[key];
				if (serverVal !== undefined && String(serverVal) === String(value)) {
					const next = { ...prev };
					delete next[key];
					return next;
				}
				return { ...prev, [key]: value };
			});
		};
	}

	// Typed action objects — each section gets its own named setters
	const lockoutActions = {
		onEnableAccountLockingChange: makeSetter('enableAccountLocking'),
		onLockoutDurationChange: makeSetter('lockoutDurationMinutes'),
		onMaxLoginAttemptsChange: makeSetter('maxLoginAttempts'),
	};

	const policyActions = {
		onMinPasswordAgeDaysChange: makeSetter('minPasswordAgeDays'),
		onPasswordExpiryDaysChange: makeSetter('passwordExpiryDays'),
		onPasswordHistoryDepthChange: makeSetter('passwordHistoryDepth'),
		onRequirePasswordChangeChange: makeSetter('requirePasswordChange'),
		onRequireSpecialCharacterChange: makeSetter('requireSpecialCharacter'),
	};

	const rateLimitActions = {
		onAuthRateLimitEnabledChange: makeSetter('authRateLimitEnabled'),
		onAuthRateLimitMaxRequestsChange: makeSetter('authRateLimitMaxRequests'),
		onAuthRateLimitWindowMinutesChange: makeSetter('authRateLimitWindowMinutes'),
	};

	const selfRegistrationActions = {
		onSelfRegistrationEnabledChange: makeSetter('selfRegistrationEnabled'),
	};

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!serverData) return;

		const updates = buildUpdates(overrides);
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
						<p className="text-muted-foreground text-sm">
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
			<Card>
				<CardHeader>
					<CardTitle>Authentication Security</CardTitle>
					<CardDescription>
						Configure password policies and account lockout rules
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form className="space-y-6" onSubmit={handleSubmit}>
						<AccountLockoutSection
							enableAccountLocking={formValues.enableAccountLocking}
							lockoutDurationMinutes={formValues.lockoutDurationMinutes}
							maxLoginAttempts={formValues.maxLoginAttempts}
							{...lockoutActions}
						/>

						<PasswordPolicySection
							minPasswordAgeDays={formValues.minPasswordAgeDays}
							passwordExpiryDays={formValues.passwordExpiryDays}
							passwordHistoryDepth={formValues.passwordHistoryDepth}
							requirePasswordChange={formValues.requirePasswordChange}
							requireSpecialCharacter={formValues.requireSpecialCharacter}
							{...policyActions}
						/>

						<SelfRegistrationSection
							selfRegistrationEnabled={formValues.selfRegistrationEnabled}
							{...selfRegistrationActions}
						/>

						<AuthRateLimitSection
							authRateLimitEnabled={formValues.authRateLimitEnabled}
							authRateLimitMaxRequests={formValues.authRateLimitMaxRequests}
							authRateLimitWindowMinutes={formValues.authRateLimitWindowMinutes}
							{...rateLimitActions}
						/>

						<Button disabled={!dirty || mutation.isPending} type="submit">
							{mutation.isPending ? 'Saving…' : 'Save Settings'}
						</Button>
					</form>
				</CardContent>
			</Card>
			<OAuthProvidersSection />
			<BackupKeyRotationSection />
			{canViewHealth && (
				<SecurityHealthSection data={healthData?.data} isLoading={healthLoading} />
			)}
		</>
	);
}

export { AuthenticationTab };
