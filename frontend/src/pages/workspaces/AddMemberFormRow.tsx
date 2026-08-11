import { useState } from 'react';

import type { User } from '@/api/types';

import { RoleSelector } from '@/components/shared/RoleSelector';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

import { WORKSPACE_ROLE_OPTIONS } from './constants';
import { UserPicker } from './UserPicker';

interface AddMemberFormRowProps {
	existingMemberIds: Set<number>;
	form: { role: string; userId: number };
	isPending: boolean;
	onAddMember: () => void;
	onUpdateForm: (update: { role?: string; userId?: number }) => void;
}

function AddMemberFormRow({
	existingMemberIds,
	form,
	isPending,
	onAddMember,
	onUpdateForm,
}: AddMemberFormRowProps) {
	const [pickerUser, setPickerUser] = useState<null | User>(null);

	// Derive the effective selection from the form state so external resets
	// (e.g. parent clearing form.userId after a successful add) clear the picker.
	const selectedUser = form.userId === 0 ? null : pickerUser;

	const handleSelect = (user: null | User) => {
		setPickerUser(user);
		onUpdateForm({ userId: user?.id ?? 0 });
	};

	return (
		<>
			<Label className="sr-only" htmlFor="addMemberUser">
				User
			</Label>
			{/*
			 * Same column geometry as `ManageMemberRow` below it — `px-3`, `gap-3`, a `w-32` role
			 * control and a `w-16` action slot — so the role selectors share one right edge instead
			 * of zig-zagging down the dialog at two widths and two offsets.
			 */}
			<div className="flex gap-3 px-3">
				<UserPicker
					existingMemberIds={existingMemberIds}
					onSelect={handleSelect}
					selectedUser={selectedUser}
				/>
				<RoleSelector
					className="w-32 shrink-0"
					onValueChange={(role) => onUpdateForm({ role })}
					roles={WORKSPACE_ROLE_OPTIONS}
					value={form.role}
				/>
				<Button
					className="w-16 shrink-0"
					disabled={isPending || form.userId === 0}
					onClick={onAddMember}>
					Add
				</Button>
			</div>
		</>
	);
}

export { AddMemberFormRow };
