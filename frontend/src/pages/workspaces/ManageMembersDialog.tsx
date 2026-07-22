import { useState } from 'react';

import type { WorkspaceMember } from '@/api/types';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog';

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
			<AlertDialog onOpenChange={onOpenChange} open={isOpen}>
				<AlertDialogContent className="max-w-2xl">
					<AlertDialogHeader>
						<AlertDialogTitle>Workspace Members</AlertDialogTitle>
						<AlertDialogDescription>
							View and manage workspace members.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="space-y-4 py-4">
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
					<AlertDialogFooter>
						<AlertDialogCancel>Close</AlertDialogCancel>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>

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
			/>
		</>
	);
}

export { ManageMembersDialog };
