import { useState } from 'react';

import type { WorkspaceMember } from '@/api/types';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

import { AddMemberFormRow } from './AddMemberFormRow';
import { BulkMemberActions } from './BulkMemberActions';
import { MemberList } from './MemberList';

interface ManageMemberOperations {
	onAddMember: () => void;
	onBulkAddMembers?: (members: { role: string; userId: number }[]) => void;
	onBulkRemoveMembers?: (userIds: number[]) => void;
	onRemoveMember: (userId: number) => void;
	onUpdateMemberRole: (userId: number, role: string) => void;
}

interface ManageFormState {
	addMemberForm: { role: string; userId: number };
	onUpdateAddMemberForm: (form: { role?: string; userId?: number }) => void;
}

interface ManageMembersDialogProps {
	bulkIsPending: { add: boolean; remove: boolean };
	formState: ManageFormState;
	isOpen: boolean;
	isPending: boolean;
	members: WorkspaceMember[];
	onOpenChange: (open: boolean) => void;
	operations: ManageMemberOperations;
}

function useMemberSelection() {
	const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
	const [showBulkRemoveConfirm, setShowBulkRemoveConfirm] = useState(false);

	const toggleUserSelection = (userId: number) => {
		setSelectedUserIds((prev) => {
			const next = new Set(prev);
			if (next.has(userId)) {
				next.delete(userId);
			} else {
				next.add(userId);
			}
			return next;
		});
	};

	const clearSelection = () => setSelectedUserIds(new Set());

	return {
		clearSelection,
		selectedUserIds,
		setShowBulkRemoveConfirm,
		showBulkRemoveConfirm,
		toggleUserSelection,
	};
}

function ManageMembersDialog({
	bulkIsPending,
	formState,
	isOpen,
	isPending,
	members,
	onOpenChange,
	operations,
}: ManageMembersDialogProps) {
	const { addMemberForm, onUpdateAddMemberForm } = formState;
	const {
		onAddMember,
		onBulkAddMembers,
		onBulkRemoveMembers,
		onRemoveMember,
		onUpdateMemberRole,
	} = operations;
	const {
		clearSelection,
		selectedUserIds,
		setShowBulkRemoveConfirm,
		showBulkRemoveConfirm,
		toggleUserSelection,
	} = useMemberSelection();

	const existingMemberIds = new Set(members.map((m) => m.userId));

	const handleBulkRemove = () => {
		if (onBulkRemoveMembers && selectedUserIds.size > 0) {
			setShowBulkRemoveConfirm(true);
		}
	};

	const handleBulkAdd = () => {
		if (onBulkAddMembers && selectedUserIds.size > 0) {
			const bulkMembers = Array.from(selectedUserIds).map((userId) => ({
				role: addMemberForm.role,
				userId,
			}));
			onBulkAddMembers(bulkMembers);
			clearSelection();
		}
	};

	return (
		<>
			{/* `Dialog`, not `AlertDialog` — see the note in CreateWorkspaceDialog. */}
			<Dialog onOpenChange={onOpenChange} open={isOpen}>
				{/*
				 * The width and the scroll cap are spelled out here because DialogContent, unlike
				 * AlertDialogContent, has neither a `size` prop nor a built-in height cap. Dropping
				 * to the default `sm:max-w-lg` would put this panel back at 512px — the width of the
				 * create and edit prompts — and squeeze the member list into 462px until it scrolled
				 * at five members; dropping `max-h-[85vh] overflow-y-auto` would let a long roster
				 * run off both ends of the viewport with no way to reach the footer.
				 */}
				<DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Workspace Members</DialogTitle>
						<DialogDescription>View and manage workspace members.</DialogDescription>
					</DialogHeader>
					{/*
					 * No `py-4`. DialogContent is a grid with a 16px gap, so the padding was
					 * doubling the two seams that frame the body — 32px under the header and 32px
					 * above the footer — where CreateUserDialog, the reference, puts its form
					 * straight into the content grid and gets 16px.
					 */}
					<div className="space-y-4">
						<AddMemberFormRow
							existingMemberIds={existingMemberIds}
							form={addMemberForm}
							isPending={isPending}
							onAddMember={onAddMember}
							onUpdateForm={onUpdateAddMemberForm}
						/>
						<BulkMemberActions
							bulkIsPending={bulkIsPending}
							onBulkAdd={handleBulkAdd}
							onBulkRemove={handleBulkRemove}
							onClearSelection={clearSelection}
							roleName={addMemberForm.role}
							selectedCount={selectedUserIds.size}
						/>
						<div className="max-h-96 overflow-y-auto">
							<MemberList
								members={members}
								onRemove={onRemoveMember}
								onToggleSelection={toggleUserSelection}
								onUpdateRole={onUpdateMemberRole}
								selectedUserIds={selectedUserIds}
							/>
						</div>
					</div>
					{/* `showCloseButton` renders exactly the outline "Close" this footer had. */}
					<DialogFooter showCloseButton />
				</DialogContent>
			</Dialog>

			<ConfirmAlertDialog
				confirmText="Remove"
				description={`Are you sure you want to remove ${selectedUserIds.size} selected members from this workspace?`}
				isOpen={showBulkRemoveConfirm}
				onConfirm={() => {
					if (onBulkRemoveMembers) {
						onBulkRemoveMembers(Array.from(selectedUserIds));
						clearSelection();
					}
					setShowBulkRemoveConfirm(false);
				}}
				onOpenChange={(open) => {
					if (!open) setShowBulkRemoveConfirm(false);
				}}
				title="Remove Members"
				variant="destructive"
			/>
		</>
	);
}

export { ManageMembersDialog };
