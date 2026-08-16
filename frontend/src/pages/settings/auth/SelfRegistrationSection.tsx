import { ShieldAlert } from 'lucide-react';

import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';

import { SettingsToggleRow } from '../SettingsToggleRow';

/** Typed state for the self-registration section. */
interface SelfRegistrationState {
	selfRegistrationEnabled: boolean;
}

/** Typed actions for the self-registration section. */
interface SelfRegistrationActions {
	onSelfRegistrationEnabledChange: (checked: boolean) => void;
}

type SelfRegistrationSectionProps = SelfRegistrationActions & SelfRegistrationState;

function SelfRegistrationSection({
	onSelfRegistrationEnabledChange,
	selfRegistrationEnabled,
}: SelfRegistrationSectionProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Self-Registration</CardTitle>
				<CardDescription>
					Whether visitors can create their own accounts from the registration page.
				</CardDescription>
				{/*
				 * The one card here whose *on* state is the weaker one: self-registration open
				 * means anybody who can reach the app can make an account. Same marker,
				 * inverted condition. See AccountLockoutSection for the reasoning.
				 */}
				{selfRegistrationEnabled && (
					<CardAction>
						<ShieldAlert
							aria-label="Self-registration is open to anyone"
							className="size-5 text-warning"
						/>
					</CardAction>
				)}
			</CardHeader>
			{/* Same `max-w-2xl` stack cap as the other three authentication sections. See
			    SettingsToggleRow. */}
			<CardContent className="max-w-2xl">
				<SettingsToggleRow
					checked={selfRegistrationEnabled}
					description={
						selfRegistrationEnabled
							? 'New users can create their own accounts.'
							: 'Registration page is disabled — only admins can create accounts.'
					}
					id="selfRegistrationEnabled"
					label="Allow self-registration"
					onCheckedChange={onSelfRegistrationEnabledChange}
				/>
			</CardContent>
		</Card>
	);
}

export { SelfRegistrationSection };
export type { SelfRegistrationActions, SelfRegistrationState };
