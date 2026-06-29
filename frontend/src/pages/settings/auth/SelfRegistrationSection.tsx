import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** Typed state for the self-registration section. */
interface SelfRegistrationState {
	selfRegistrationEnabled: boolean;
}

/** Typed actions for the self-registration section. */
interface SelfRegistrationActions {
	onSelfRegistrationEnabledChange: (checked: boolean) => void;
}

type SelfRegistrationSectionProps = SelfRegistrationState & SelfRegistrationActions;

function SelfRegistrationSection({
	onSelfRegistrationEnabledChange,
	selfRegistrationEnabled,
}: SelfRegistrationSectionProps) {
	return (
		<div className="flex flex-row items-center justify-between rounded-lg border p-4">
			<div className="space-y-0.5">
				<Label htmlFor="selfRegistrationEnabled">Self-Registration</Label>
				<p className="text-muted-foreground text-sm">
					{selfRegistrationEnabled
						? 'New users can create their own accounts via the registration page'
						: 'Registration page is disabled — only admins can create accounts'}
				</p>
			</div>
			<Switch
				checked={selfRegistrationEnabled}
				id="selfRegistrationEnabled"
				onCheckedChange={onSelfRegistrationEnabledChange}
			/>
		</div>
	);
}

export { SelfRegistrationSection };
export type { SelfRegistrationActions, SelfRegistrationState };
