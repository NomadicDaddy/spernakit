import type { InputHTMLAttributes } from 'react';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** Typed state for the account lockout section. */
interface AccountLockoutState {
	enableAccountLocking: boolean;
	lockoutDurationMinutes: string;
	maxLoginAttempts: string;
}

/** Typed actions for the account lockout section — each field has its own setter. */
interface AccountLockoutActions {
	onEnableAccountLockingChange: (checked: boolean) => void;
	onLockoutDurationChange: (value: string) => void;
	onMaxLoginAttemptsChange: (value: string) => void;
}

type AccountLockoutSectionProps = AccountLockoutState & AccountLockoutActions;

function AccountLockoutSection({
	enableAccountLocking,
	lockoutDurationMinutes,
	maxLoginAttempts,
	onEnableAccountLockingChange,
	onLockoutDurationChange,
	onMaxLoginAttemptsChange,
}: AccountLockoutSectionProps) {
	return (
		<>
			<div className="flex flex-row items-center justify-between rounded-lg border p-4">
				<div className="space-y-0.5">
					<Label htmlFor="enableAccountLocking">Account Lockout</Label>
					<p className="text-muted-foreground text-sm">
						Lock user accounts after repeated failed login attempts
					</p>
				</div>
				<Switch
					checked={enableAccountLocking}
					id="enableAccountLocking"
					onCheckedChange={onEnableAccountLockingChange}
				/>
			</div>

			{enableAccountLocking && (
				<div className="space-y-4 rounded-lg border p-4">
					<div className="space-y-2">
						<Label htmlFor="maxLoginAttempts">Max Failed Login Attempts</Label>
						<NumberInput
							id="maxLoginAttempts"
							max={100}
							min={1}
							onChange={onMaxLoginAttemptsChange}
							value={maxLoginAttempts}
						/>
						<p className="text-muted-foreground text-sm">
							Number of failed attempts before account is locked (1-100)
						</p>
					</div>

					<div className="space-y-2">
						<Label htmlFor="lockoutDurationMinutes">Lockout Duration (minutes)</Label>
						<NumberInput
							id="lockoutDurationMinutes"
							max={1440}
							min={1}
							onChange={onLockoutDurationChange}
							value={lockoutDurationMinutes}
						/>
						<p className="text-muted-foreground text-sm">
							How long the account remains locked (1-1440 minutes)
						</p>
					</div>
				</div>
			)}
		</>
	);
}

/** Shared numeric input for auth security forms. */
function NumberInput({
	id,
	max,
	min,
	onChange,
	value,
}: {
	id: string;
	max: number;
	min: number;
	onChange: (value: string) => void;
	value: string;
} & Pick<InputHTMLAttributes<HTMLInputElement>, never>) {
	return (
		<Input
			autoComplete="off"
			id={id}
			inputMode="numeric"
			max={max}
			min={min}
			onChange={(e) => onChange(e.target.value)}
			type="number"
			value={value}
		/>
	);
}

export { AccountLockoutSection };
export type { AccountLockoutActions, AccountLockoutState };
