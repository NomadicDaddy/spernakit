import { useState } from 'react';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { CardSkeleton } from '@/components/shared/skeletons/CardSkeleton';
import { Separator } from '@/components/ui/separator';
import { useProfile } from '@/hooks/useProfile';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';

import { PasswordForm } from './PasswordForm';
import { ProfileForm } from './ProfileForm';

function PersonalInfoTab() {
	const { data, isLoading } = useProfile();

	const [profileDirty, setProfileDirty] = useState(false);
	const [passwordDirty, setPasswordDirty] = useState(false);

	const blocker = useUnsavedChanges(profileDirty || passwordDirty);

	const handleProfileDirtyChange = (dirty: boolean) => {
		setProfileDirty(dirty);
	};

	const handlePasswordDirtyChange = (dirty: boolean) => {
		setPasswordDirty(dirty);
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
			<ConfirmAlertDialog
				description="You have unsaved changes. Are you sure you want to leave?"
				isOpen={blocker.state === 'blocked'}
				onConfirm={() => blocker.proceed?.()}
				onOpenChange={(open) => {
					if (!open) blocker.reset?.();
				}}
				title="Unsaved Changes"
			/>
			<div className="space-y-6">
				<ProfileForm
					key={data.data.id}
					onDirtyChange={handleProfileDirtyChange}
					user={data.data}
				/>
				<Separator />
				<PasswordForm onDirtyChange={handlePasswordDirtyChange} />
			</div>
		</>
	);
}

export { PersonalInfoTab };
