import { useState } from 'react';

import { type DialogState } from './WorkspaceConfirmDialogs';

function withWorkspaceId<A extends unknown[]>(
	workspaceId: null | number,
	fn: (id: number, ...args: A) => void
): (...args: A) => void {
	return (...args: A) => {
		if (workspaceId !== null) fn(workspaceId, ...args);
	};
}

function useWorkspaceDialogState() {
	const [dialog, setDialog] = useState<DialogState>({ type: null });
	const [addMemberForm, setAddMemberForm] = useState({ role: 'VIEWER', userId: 0 });
	const [deleteTarget, setDeleteTarget] = useState<{ id: number; name: string } | null>(null);
	const [removeMemberTarget, setRemoveMemberTarget] = useState<{
		userId: number;
		workspaceId: number;
	} | null>(null);

	const selectedWorkspace =
		dialog.type === 'edit' || dialog.type === 'members' ? dialog.workspaceId : null;

	const closeDialog = () => setDialog({ type: null });

	return {
		addMemberForm,
		closeDialog,
		deleteTarget,
		dialog,
		removeMemberTarget,
		selectedWorkspace,
		setAddMemberForm,
		setDeleteTarget,
		setDialog,
		setRemoveMemberTarget,
	};
}

export { useWorkspaceDialogState, withWorkspaceId };
