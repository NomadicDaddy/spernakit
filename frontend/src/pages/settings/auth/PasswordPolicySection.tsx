import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SettingsNumberField } from '../SettingsNumberField';
import { SettingsToggleRow } from '../SettingsToggleRow';

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

type PasswordPolicySectionProps = PasswordPolicyActions & PasswordPolicyState;

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
		<Card>
			<CardHeader>
				{/*
				 * The group name was an `h2.text-sm.font-medium` inside a bordered box — 14px/500,
				 * lighter than the CardTitle above it and indented 17px from it, and one of two
				 * `<h2>` elements on the surface rendering at two different sizes. `CardTitle asChild`
				 * gives all four policy groups one title treatment and no ad-hoc heading sizes.
				 */}
				<CardTitle>Password Policy</CardTitle>
				<CardDescription>
					Rules applied when a user sets or changes a password.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{/*
				 * Three numeric fields across, not three rows of one 320px input. Each holds one or
				 * two digits, and OAuthProvidersSection on this same surface already pairs its inputs
				 * this way.
				 *
				 * `max-w-2xl` is the same cap AccountLockoutSection and AuthRateLimitSection put on
				 * their field grids. Without it this grid ran 1422px at 2560 — three numeric inputs
				 * for two-digit values stretched to 462px each — while the two cards directly below
				 * it stopped at 672px, so scrolling the surface moved the right edge of the fields in
				 * and out for no reason the user could see. Three columns inside the shared cap gives
				 * 213px per field, which is still wider than any value they hold.
				 */}
				<div className="grid max-w-2xl gap-4 sm:grid-cols-3">
					<SettingsNumberField
						hint={
							passwordExpiryDayCount === 0
								? 'Passwords never expire.'
								: `Passwords expire after ${formatDays(passwordExpiryDays)}.`
						}
						id="passwordExpiryDays"
						label="Password Expiry (days)"
						max={365}
						min={0}
						onChange={onPasswordExpiryDaysChange}
						value={passwordExpiryDays}
					/>
					<SettingsNumberField
						hint={
							passwordHistoryCount === 0
								? 'Password reuse is not prevented.'
								: `Users cannot reuse the last ${String(passwordHistoryCount)} password${passwordHistoryCount === 1 ? '' : 's'}.`
						}
						id="passwordHistoryDepth"
						label="Password History Depth"
						max={100}
						min={0}
						onChange={onPasswordHistoryDepthChange}
						value={passwordHistoryDepth}
					/>
					<SettingsNumberField
						hint={
							minPasswordAgeDayCount === 0
								? 'Users can change password anytime.'
								: `Users must wait ${formatDays(minPasswordAgeDays)} before changing again.`
						}
						id="minPasswordAgeDays"
						label="Minimum Password Age (days)"
						max={365}
						min={0}
						onChange={onMinPasswordAgeDaysChange}
						value={minPasswordAgeDays}
					/>
				</div>

				<SettingsToggleRow
					checked={requirePasswordChange}
					description="Force users to change password when logging in."
					id="requirePasswordChange"
					label="Require password change on first login"
					onCheckedChange={onRequirePasswordChangeChange}
				/>

				<SettingsToggleRow
					checked={requireSpecialCharacter}
					description="Passwords must contain at least one special character."
					id="requireSpecialCharacter"
					label="Require special character in passwords"
					onCheckedChange={onRequireSpecialCharacterChange}
				/>
			</CardContent>
		</Card>
	);
}

export { PasswordPolicySection };
export type { PasswordPolicyActions, PasswordPolicyState };
