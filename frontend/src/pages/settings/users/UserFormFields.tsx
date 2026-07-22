import type { UserRole } from '@/api/types';

import { RoleSelector } from '@/components/shared/RoleSelector';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthorization } from '@/hooks/useAuthorization';
import { USERNAME_MIN_LENGTH } from '@/lib/validation';
import { ROLES } from '@/types/roles';

interface UserFormFieldsProps {
	email: string;
	emailError?: string;
	idPrefix: string;
	onEmailBlur?: () => void;
	onEmailChange: (value: string) => void;
	onRoleChange: (value: UserRole) => void;
	onUsernameBlur?: () => void;
	onUsernameChange: (value: string) => void;
	role: '' | UserRole;
	username: string;
	usernameError?: string;
}

export function UserFormFields({
	email,
	emailError,
	idPrefix,
	onEmailBlur,
	onEmailChange,
	onRoleChange,
	onUsernameBlur,
	onUsernameChange,
	role,
	username,
	usernameError,
}: UserFormFieldsProps) {
	const { roleLabel } = useAuthorization();
	const usernameErrorId = `${idPrefix}-username-error`;
	const usernameHelperId = `${idPrefix}-username-helper`;
	const emailErrorId = `${idPrefix}-email-error`;
	const emailHelperId = `${idPrefix}-email-helper`;
	const hasUsernameError = typeof usernameError === 'string' && usernameError.length > 0;
	const hasEmailError = typeof emailError === 'string' && emailError.length > 0;

	return (
		<>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}-username`}>Username</Label>
				<Input
					aria-describedby={hasUsernameError ? usernameErrorId : usernameHelperId}
					autoComplete="off"
					id={`${idPrefix}-username`}
					onBlur={onUsernameBlur}
					onChange={(e) => onUsernameChange(e.target.value)}
					required
					spellCheck={false}
					value={username}
					{...(hasUsernameError ? { 'aria-invalid': true } : {})}
				/>
				{hasUsernameError ? (
					<p className="text-destructive text-sm" id={usernameErrorId}>
						{usernameError}
					</p>
				) : (
					<p className="text-muted-foreground text-sm" id={usernameHelperId}>
						At least {USERNAME_MIN_LENGTH} characters
					</p>
				)}
			</div>
			<div className="space-y-2">
				<Label htmlFor={`${idPrefix}-email`}>Email</Label>
				<Input
					aria-describedby={hasEmailError ? emailErrorId : emailHelperId}
					autoComplete="off"
					id={`${idPrefix}-email`}
					onBlur={onEmailBlur}
					onChange={(e) => onEmailChange(e.target.value)}
					required
					spellCheck={false}
					type="email"
					value={email}
					{...(hasEmailError ? { 'aria-invalid': true } : {})}
				/>
				{hasEmailError ? (
					<p className="text-destructive text-sm" id={emailErrorId}>
						{emailError}
					</p>
				) : (
					<p className="text-muted-foreground text-sm" id={emailHelperId}>
						Must be a valid email address
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
