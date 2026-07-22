import { type useWorkspaces } from '@/hooks/useWorkspaces';

import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { EditWorkspaceDialog } from './EditWorkspaceDialog';
import { type DialogState } from './WorkspaceConfirmDialogs';
import { withWorkspaceId } from './workspaceManagementHelpers';

function WorkspaceFormDialogs({
	closeDialog,
	createWorkspace,
	createWorkspaceIsPending,
	dialog,
	selectedWorkspace,
	updateWorkspace,
	updateWorkspaceIsPending,
	workspaces,
}: {
	closeDialog: () => void;
	createWorkspace: ReturnType<typeof useWorkspaces>['createWorkspace'];
	createWorkspaceIsPending: boolean;
	dialog: DialogState;
	selectedWorkspace: null | number;
	updateWorkspace: ReturnType<typeof useWorkspaces>['updateWorkspace'];
	updateWorkspaceIsPending: boolean;
	workspaces: ReturnType<typeof useWorkspaces>['workspaces'];
}) {
	return (
		<>
			<CreateWorkspaceDialog
				isOpen={dialog.type === 'create'}
				isPending={createWorkspaceIsPending}
				onCreate={(form) => {
					createWorkspace(form, { onSuccess: () => closeDialog() });
				}}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
			/>

			<EditWorkspaceDialog
				isOpen={dialog.type === 'edit'}
				isPending={updateWorkspaceIsPending}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				onUpdate={withWorkspaceId(
					selectedWorkspace,
					(id, form: { description?: string; name?: string }) => {
						updateWorkspace({ id, input: form });
						closeDialog();
					}
				)}
				workspace={workspaces.find((w) => w.id === selectedWorkspace)}
			/>
		</>
	);
}

export { WorkspaceFormDialogs };
