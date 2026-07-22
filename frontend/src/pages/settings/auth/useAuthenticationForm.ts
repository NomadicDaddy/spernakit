import { useState } from 'react';

import type { AuthSecuritySettings } from '@/api/authSecurity';

import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

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

interface AuthenticationFormState {
	dirty: boolean;
	formValues: {
		authRateLimitEnabled: boolean;
		authRateLimitMaxRequests: string;
		authRateLimitWindowMinutes: string;
		enableAccountLocking: boolean;
		lockoutDurationMinutes: string;
		maxLoginAttempts: string;
		minPasswordAgeDays: string;
		passwordExpiryDays: string;
		passwordHistoryDepth: string;
		requirePasswordChange: boolean;
		requireSpecialCharacter: boolean;
		selfRegistrationEnabled: boolean;
	};
	getUpdates: () => Partial<AuthSecuritySettings>;
	lockoutActions: {
		onEnableAccountLockingChange: (value: boolean) => void;
		onLockoutDurationChange: (value: string) => void;
		onMaxLoginAttemptsChange: (value: string) => void;
	};
	policyActions: {
		onMinPasswordAgeDaysChange: (value: string) => void;
		onPasswordExpiryDaysChange: (value: string) => void;
		onPasswordHistoryDepthChange: (value: string) => void;
		onRequirePasswordChangeChange: (value: boolean) => void;
		onRequireSpecialCharacterChange: (value: boolean) => void;
	};
	rateLimitActions: {
		onAuthRateLimitEnabledChange: (value: boolean) => void;
		onAuthRateLimitMaxRequestsChange: (value: string) => void;
		onAuthRateLimitWindowMinutesChange: (value: string) => void;
	};
	reset: () => void;
	selfRegistrationActions: {
		onSelfRegistrationEnabledChange: (value: boolean) => void;
	};
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

function buildUpdates(overrides: FormOverrides): Partial<AuthSecuritySettings> {
	const updates: Partial<AuthSecuritySettings> = {};
	for (const key of NUMBER_FIELDS) {
		const value = overrides[key];
		if (value !== undefined)
			(updates as Record<string, number>)[key] = Number.parseInt(value, 10);
	}
	for (const key of BOOLEAN_FIELDS) {
		const value = overrides[key];
		if (value !== undefined) (updates as Record<string, boolean>)[key] = value;
	}
	return updates;
}

function useAuthenticationForm(
	serverData: AuthSecuritySettings | undefined
): AuthenticationFormState {
	const [overrides, setOverrides] = useState<FormOverrides>({});
	const dirty = Object.keys(overrides).length > 0;
	useUnsavedChanges(dirty);

	function booleanValue(key: keyof FormOverrides, fallback: boolean): boolean {
		return (
			(overrides[key] as boolean | undefined) ??
			(serverData?.[key] as boolean | undefined) ??
			fallback
		);
	}

	function numberValue(key: keyof FormOverrides, fallback: string): string {
		return (
			(overrides[key] as string | undefined) ??
			(serverData?.[key] as number | undefined)?.toString() ??
			fallback
		);
	}

	function makeSetter<Key extends keyof FormOverrides>(key: Key) {
		return (value: FormOverrides[Key]): void => {
			setOverrides((current) => {
				const serverValue = serverData?.[key];
				if (serverValue !== undefined && String(serverValue) === String(value)) {
					const next = { ...current };
					delete next[key];
					return next;
				}
				return { ...current, [key]: value };
			});
		};
	}

	return {
		dirty,
		formValues: {
			authRateLimitEnabled: booleanValue('authRateLimitEnabled', true),
			authRateLimitMaxRequests: numberValue('authRateLimitMaxRequests', '10'),
			authRateLimitWindowMinutes: numberValue('authRateLimitWindowMinutes', '15'),
			enableAccountLocking: booleanValue('enableAccountLocking', false),
			lockoutDurationMinutes: numberValue('lockoutDurationMinutes', '15'),
			maxLoginAttempts: numberValue('maxLoginAttempts', '5'),
			minPasswordAgeDays: numberValue('minPasswordAgeDays', '0'),
			passwordExpiryDays: numberValue('passwordExpiryDays', '0'),
			passwordHistoryDepth: numberValue('passwordHistoryDepth', '5'),
			requirePasswordChange: booleanValue('requirePasswordChange', false),
			requireSpecialCharacter: booleanValue('requireSpecialCharacter', false),
			selfRegistrationEnabled: booleanValue('selfRegistrationEnabled', true),
		},
		getUpdates: () => buildUpdates(overrides),
		lockoutActions: {
			onEnableAccountLockingChange: makeSetter('enableAccountLocking'),
			onLockoutDurationChange: makeSetter('lockoutDurationMinutes'),
			onMaxLoginAttemptsChange: makeSetter('maxLoginAttempts'),
		},
		policyActions: {
			onMinPasswordAgeDaysChange: makeSetter('minPasswordAgeDays'),
			onPasswordExpiryDaysChange: makeSetter('passwordExpiryDays'),
			onPasswordHistoryDepthChange: makeSetter('passwordHistoryDepth'),
			onRequirePasswordChangeChange: makeSetter('requirePasswordChange'),
			onRequireSpecialCharacterChange: makeSetter('requireSpecialCharacter'),
		},
		rateLimitActions: {
			onAuthRateLimitEnabledChange: makeSetter('authRateLimitEnabled'),
			onAuthRateLimitMaxRequestsChange: makeSetter('authRateLimitMaxRequests'),
			onAuthRateLimitWindowMinutesChange: makeSetter('authRateLimitWindowMinutes'),
		},
		reset: () => setOverrides({}),
		selfRegistrationActions: {
			onSelfRegistrationEnabledChange: makeSetter('selfRegistrationEnabled'),
		},
	};
}

export { useAuthenticationForm };
