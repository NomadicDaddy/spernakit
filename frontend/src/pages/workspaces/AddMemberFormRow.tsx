import { useId, useState } from 'react';

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
	const userLabelId = useId();

	// Derive the effective selection from the form state so external resets
	// (e.g. parent clearing form.userId after a successful add) clear the picker.
	const selectedUser = form.userId === 0 ? null : pickerUser;

	const handleSelect = (user: null | User) => {
		setPickerUser(user);
		onUpdateForm({ userId: user?.id ?? 0 });
	};

	return (
		<>
			{/*
			 * Named through `aria-labelledby` on the picker rather than `htmlFor`. This pointed
			 * at "addMemberUser", an id nothing on the page carried: `UserPicker` renders a Radix
			 * trigger with no id of its own, so the association resolved to nothing and the only
			 * label on the field was inert. `RoleSelector` beside it takes an `aria-label` for the
			 * same reason.
			 */}
			<Label className="sr-only" id={userLabelId}>
				User
			</Label>
			{/*
			 * At `sm` and up: the same column geometry as `ManageMemberRow` below it — `px-3`,
			 * `gap-3`, a `w-32` role control and a `w-16` action slot — so the role selectors share
			 * one right edge instead of zig-zagging down the dialog at two widths and two offsets.
			 *
			 * Below `sm` it stacks. Flat, the three controls are unbreakable — a 167px picker, a
			 * 128px role select and a 64px Add button, none of which shrink — so the row demanded
			 * 407px and set the min-content floor that burst the dialog's grid track at 360. The
			 * widths are gated, not removed: they exist to align this row with the member list on a
			 * 672px panel, and deleting them would trade a mobile defect for a desktop one.
			 */}
			<div className="flex flex-col gap-2 px-3 sm:flex-row sm:gap-3">
				<UserPicker
					existingMemberIds={existingMemberIds}
					labelledBy={userLabelId}
					onSelect={handleSelect}
					selectedUser={selectedUser}
				/>
				<RoleSelector
					className="w-full shrink-0 sm:w-32"
					onValueChange={(role) => onUpdateForm({ role })}
					roles={WORKSPACE_ROLE_OPTIONS}
					value={form.role}
				/>
				<Button
					className="w-full shrink-0 sm:w-16"
					disabled={isPending || form.userId === 0}
					onClick={onAddMember}>
					Add
				</Button>
			</div>
		</>
	);
}

export { AddMemberFormRow };
