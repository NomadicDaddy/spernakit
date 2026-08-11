import { useState } from 'react';

import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { UnsavedChangesGuard } from '@/components/shared/UnsavedChangesGuard';
import { useProfile } from '@/hooks/useProfile';

import { ProfileForm } from './ProfileForm';

/**
 * Identity only.
 *
 * The Change Password card used to live here too, under a `<Separator />`, while a Security tab sat
 * forty pixels above it in the same rail holding nothing but MFA. A user looking for the password
 * form goes to Security first, so that is where it is now; this tab is the username, the email and
 * the role, and nothing else.
 *
 * No width cap. `max-w-3xl` clamped these cards to 768px under a tab rule that ran the full 1472px
 * canvas, and the three sibling tabs in the same rail are all uncapped — so switching between them
 * re-flowed the content width while the chrome stayed put. Structure comes from the grids and field
 * widths inside the cards, the way the settings cards already do it.
 */
function PersonalInfoTab() {
	const { data, isLoading } = useProfile();

	const [profileDirty, setProfileDirty] = useState(false);

	const handleProfileDirtyChange = (dirty: boolean) => {
		setProfileDirty(dirty);
	};

	if (isLoading || !data?.data) {
		return (
			<div className="space-y-6">
				<CardSkeleton contentLines={3} descriptionWidth="h-4 w-48" titleWidth="h-6 w-32" />
			</div>
		);
	}

	return (
		<>
			<UnsavedChangesGuard isDirty={profileDirty} />
			<div className="space-y-6">
				<ProfileForm
					key={data.data.id}
					onDirtyChange={handleProfileDirtyChange}
					user={data.data}
				/>
			</div>
		</>
	);
}

export { PersonalInfoTab };
