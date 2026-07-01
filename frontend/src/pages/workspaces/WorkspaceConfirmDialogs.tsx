import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';

type DialogState =
	| { type: 'create' }
	| { type: 'edit'; workspaceId: number }
	| { type: 'members'; workspaceId: number }
	| { type: null };

function WorkspaceConfirmDialogs({
	deleteTarget,
	deleteWorkspace,
	onClearDeleteTarget,
	onClearRemoveMemberTarget,
	removeMember,
	removeMemberTarget,
}: {
	deleteTarget: { id: number; name: string } | null;
	deleteWorkspace: (id: number) => void;
	onClearDeleteTarget: () => void;
	onClearRemoveMemberTarget: () => void;
	removeMember: (target: { userId: number; workspaceId: number }) => void;
	removeMemberTarget: { userId: number; workspaceId: number } | null;
}) {
	return (
		<>
			<ConfirmAlertDialog
				confirmText="Delete"
				description={`Are you sure you want to delete workspace "${deleteTarget?.name}"? This action cannot be undone.`}
				isOpen={!!deleteTarget}
				onConfirm={() => {
					if (deleteTarget) {
						deleteWorkspace(deleteTarget.id);
						onClearDeleteTarget();
					}
				}}
				onOpenChange={(open) => {
					if (!open) onClearDeleteTarget();
				}}
				title="Delete Workspace"
			/>

			<ConfirmAlertDialog
				confirmText="Remove"
				description="Are you sure you want to remove this member from the workspace?"
				isOpen={!!removeMemberTarget}
				onConfirm={() => {
					if (removeMemberTarget) {
						removeMember(removeMemberTarget);
						onClearRemoveMemberTarget();
					}
				}}
				onOpenChange={(open) => {
					if (!open) onClearRemoveMemberTarget();
				}}
				title="Remove Member"
			/>
		</>
	);
}

export { WorkspaceConfirmDialogs };
export type { DialogState };
