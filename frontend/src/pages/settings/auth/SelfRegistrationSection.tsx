import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

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
			</CardHeader>
			<CardContent>
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
