import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SettingsNumberField } from '../SettingsNumberField';
import { SettingsToggleRow } from '../SettingsToggleRow';

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

type AccountLockoutSectionProps = AccountLockoutActions & AccountLockoutState;

/**
 * One of the four policy groups on /settings/auth, each now its own Card.
 *
 * All four used to share a single "Authentication Security" card, inside which every group was a
 * `rounded-lg border p-4` box separated from its neighbours by exactly 24px — the same 24px that
 * separated a switch from the detail panel it controls. Only one of the six boxes carried a title,
 * so "Max Failed Login Attempts" floated in an unlabelled panel with nothing tying it to the toggle
 * that revealed it. A Card per group is what /profile/preferences does, and it makes the group name
 * a real heading instead of a `text-sm` label inside a border.
 */
function AccountLockoutSection({
	enableAccountLocking,
	lockoutDurationMinutes,
	maxLoginAttempts,
	onEnableAccountLockingChange,
	onLockoutDurationChange,
	onMaxLoginAttemptsChange,
}: AccountLockoutSectionProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Account Lockout</CardTitle>
				<CardDescription>
					Lock user accounts after repeated failed login attempts.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				<SettingsToggleRow
					checked={enableAccountLocking}
					id="enableAccountLocking"
					label="Enable account lockout"
					onCheckedChange={onEnableAccountLockingChange}
				/>

				{enableAccountLocking && (
					<div className="grid max-w-2xl gap-4 sm:grid-cols-2">
						<SettingsNumberField
							hint="Failed attempts before the account locks (1–100)."
							id="maxLoginAttempts"
							label="Max Failed Login Attempts"
							max={100}
							min={1}
							onChange={onMaxLoginAttemptsChange}
							value={maxLoginAttempts}
						/>
						<SettingsNumberField
							hint="How long the account stays locked (1–1440 minutes)."
							id="lockoutDurationMinutes"
							label="Lockout Duration (minutes)"
							max={1440}
							min={1}
							onChange={onLockoutDurationChange}
							value={lockoutDurationMinutes}
						/>
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export { AccountLockoutSection };
export type { AccountLockoutActions, AccountLockoutState };
