import type { Ref } from 'react';

import type { UserRole } from '@/api/types';

import { RequiredMark } from '@/components/shared/RequiredMark';
import { RoleSelector } from '@/components/shared/RoleSelector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthorization } from '@/hooks/useAuthorization';
import { USERNAME_MIN_LENGTH } from '@/lib/validation';
import { ROLES } from '@/types/roles';

interface UserFormFieldsProps {
	email: string;
	emailError?: string;
	emailInputRef?: Ref<HTMLInputElement>;
	idPrefix: string;
	onEmailBlur?: () => void;
	onEmailChange: (value: string) => void;
	onRoleChange: (value: UserRole) => void;
	onUsernameBlur?: () => void;
	onUsernameChange: (value: string) => void;
	role: '' | UserRole;
	username: string;
	usernameError?: string;
	usernameInputRef?: Ref<HTMLInputElement>;
}

export function UserFormFields({
	email,
	emailError,
	emailInputRef,
	idPrefix,
	onEmailBlur,
	onEmailChange,
	onRoleChange,
	onUsernameBlur,
	onUsernameChange,
	role,
	username,
	usernameError,
	usernameInputRef,
}: UserFormFieldsProps) {
	const { roleLabel } = useAuthorization();
	const usernameErrorId = `${idPrefix}-username-error`;
	const emailErrorId = `${idPrefix}-email-error`;
	const hasUsernameError = typeof usernameError === 'string' && usernameError.length > 0;
	const hasEmailError = typeof emailError === 'string' && emailError.length > 0;

	/*
	 * The constraint lines ("At least 2 characters", "Must be a valid email address") used to sit
	 * under every field at rest, at the same 14px as the labels above them — a four-field form
	 * carrying eight lines of equal-weight copy, spelling out formats nobody needs stated while no
	 * label marked which fields were required. The rules now surface as errors, in the same slot,
	 * one tier below the labels.
	 */
	return (
		<>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}-username`}>
					Username <RequiredMark />
				</Label>
				<Input
					aria-describedby={hasUsernameError ? usernameErrorId : undefined}
					autoComplete="off"
					id={`${idPrefix}-username`}
					minLength={USERNAME_MIN_LENGTH}
					onBlur={onUsernameBlur}
					onChange={(e) => onUsernameChange(e.target.value)}
					ref={usernameInputRef}
					required
					spellCheck={false}
					value={username}
					{...(hasUsernameError ? { 'aria-invalid': true } : {})}
				/>
				{hasUsernameError && (
					<p aria-live="polite" className="text-xs text-destructive" id={usernameErrorId}>
						{usernameError}
					</p>
				)}
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}-email`}>
					Email <RequiredMark />
				</Label>
				<Input
					aria-describedby={hasEmailError ? emailErrorId : undefined}
					autoComplete="off"
					id={`${idPrefix}-email`}
					onBlur={onEmailBlur}
					onChange={(e) => onEmailChange(e.target.value)}
					ref={emailInputRef}
					required
					spellCheck={false}
					type="email"
					value={email}
					{...(hasEmailError ? { 'aria-invalid': true } : {})}
				/>
				{hasEmailError && (
					<p aria-live="polite" className="text-xs text-destructive" id={emailErrorId}>
						{emailError}
					</p>
				)}
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}-role`}>Role</Label>
				<RoleSelector
					id={`${idPrefix}-role`}
					labelFn={(r) => roleLabel(r as UserRole)}
					onValueChange={(value) => onRoleChange(value as UserRole)}
					roles={ROLES}
					value={role}
				/>
			</div>
		</>
	);
}
