import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** Typed state for the password policy section. */
interface PasswordPolicyState {
	minPasswordAgeDays: string;
	passwordExpiryDays: string;
	passwordHistoryDepth: string;
	requirePasswordChange: boolean;
	requireSpecialCharacter: boolean;
}

/** Typed actions for the password policy section — each field has its own setter. */
interface PasswordPolicyActions {
	onMinPasswordAgeDaysChange: (value: string) => void;
	onPasswordExpiryDaysChange: (value: string) => void;
	onPasswordHistoryDepthChange: (value: string) => void;
	onRequirePasswordChangeChange: (checked: boolean) => void;
	onRequireSpecialCharacterChange: (checked: boolean) => void;
}

type PasswordPolicySectionProps = PasswordPolicyState & PasswordPolicyActions;

function formatDays(value: string): string {
	const days = Number.parseInt(value, 10);

	return `${value} day${days === 1 ? '' : 's'}`;
}

function PasswordPolicySection({
	minPasswordAgeDays,
	onMinPasswordAgeDaysChange,
	onPasswordExpiryDaysChange,
	onPasswordHistoryDepthChange,
	onRequirePasswordChangeChange,
	onRequireSpecialCharacterChange,
	passwordExpiryDays,
	passwordHistoryDepth,
	requirePasswordChange,
	requireSpecialCharacter,
}: PasswordPolicySectionProps) {
	const minPasswordAgeDayCount = Number.parseInt(minPasswordAgeDays, 10);
	const passwordExpiryDayCount = Number.parseInt(passwordExpiryDays, 10);
	const passwordHistoryCount = Number.parseInt(passwordHistoryDepth, 10);

	return (
		<div className="space-y-4 rounded-lg border p-4">
			<h2 className="text-sm font-medium">Password Policy</h2>

			<div className="space-y-2">
				<Label htmlFor="passwordExpiryDays">Password Expiry (days)</Label>
				<Input
					autoComplete="off"
					id="passwordExpiryDays"
					inputMode="numeric"
					max={365}
					min={0}
					onChange={(e) => onPasswordExpiryDaysChange(e.target.value)}
					type="number"
					value={passwordExpiryDays}
				/>
				<p className="text-muted-foreground text-sm">
					{passwordExpiryDayCount === 0
						? 'Passwords never expire'
						: `Passwords expire after ${formatDays(passwordExpiryDays)}`}
				</p>
			</div>

			<div className="flex flex-row items-center justify-between">
				<div className="space-y-0.5">
					<Label htmlFor="requirePasswordChange">
						Require Password Change on First Login
					</Label>
					<p className="text-muted-foreground text-sm">
						Force users to change password when logging in
					</p>
				</div>
				<Switch
					checked={requirePasswordChange}
					id="requirePasswordChange"
					onCheckedChange={onRequirePasswordChangeChange}
				/>
			</div>

			<div className="flex flex-row items-center justify-between">
				<div className="space-y-0.5">
					<Label htmlFor="requireSpecialCharacter">
						Require Special Character in Passwords
					</Label>
					<p className="text-muted-foreground text-sm">
						Passwords must contain at least one special character
					</p>
				</div>
				<Switch
					checked={requireSpecialCharacter}
					id="requireSpecialCharacter"
					onCheckedChange={onRequireSpecialCharacterChange}
				/>
			</div>

			<div className="space-y-2">
				<Label htmlFor="passwordHistoryDepth">Password History Depth</Label>
				<Input
					autoComplete="off"
					id="passwordHistoryDepth"
					inputMode="numeric"
					max={100}
					min={0}
					onChange={(e) => onPasswordHistoryDepthChange(e.target.value)}
					type="number"
					value={passwordHistoryDepth}
				/>
				<p className="text-muted-foreground text-sm">
					{passwordHistoryCount === 0
						? 'Password reuse is not prevented'
						: `Users cannot reuse the last ${passwordHistoryCount} password${passwordHistoryCount === 1 ? '' : 's'}`}
				</p>
			</div>

			<div className="space-y-2">
				<Label htmlFor="minPasswordAgeDays">Minimum Password Age (days)</Label>
				<Input
					autoComplete="off"
					id="minPasswordAgeDays"
					inputMode="numeric"
					max={365}
					min={0}
					onChange={(e) => onMinPasswordAgeDaysChange(e.target.value)}
					type="number"
					value={minPasswordAgeDays}
				/>
				<p className="text-muted-foreground text-sm">
					{minPasswordAgeDayCount === 0
						? 'Users can change password anytime'
						: `Users must wait ${formatDays(minPasswordAgeDays)} before changing password again`}
				</p>
			</div>
		</div>
	);
}

export { PasswordPolicySection };
export type { PasswordPolicyActions, PasswordPolicyState };
