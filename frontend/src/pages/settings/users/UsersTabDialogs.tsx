import type { User } from '@/api/types';
import type { CreateUserInput } from '@/api/users';
import type { useUsers } from '@/hooks/settings/useUsers';

import {
	BulkDeleteDialog,
	BulkRoleDialog,
	CreateUserDialog,
	DeleteUserDialog,
	EditUserDialog,
	ImpersonateDialog,
	ResetPasswordDialog,
} from './index';

/** Which of the Users tab's dialogs is open, with what it acts on. */
export type DialogState =
	| { newRole: string; type: 'bulkRole' }
	| { type: 'bulkDelete' }
	| { type: 'create' }
	| { type: 'delete'; user: User }
	| { type: 'edit'; user: User }
	| { type: 'impersonate'; user: User }
	| { type: 'resetPassword'; user: User }
	| null;

type Users = ReturnType<typeof useUsers>;

interface UsersTabDialogsProps {
	bulkDeleteMutation: Users['bulkDeleteMutation'];
	bulkRoleMutation: Users['bulkRoleMutation'];
	createMutation: Users['createMutation'];
	deleteMutation: Users['deleteMutation'];
	dialog: DialogState;
	handleBulkDelete: () => void;
	handleBulkRoleUpdate: () => void;
	selectedRows: User[];
	setDialog: (dialog: DialogState) => void;
	updateMutation: Users['updateMutation'];
}

/** Every dialog closes the same way: dismissing it clears the dialog state. */
type CloseHandler = (open: boolean) => void;

function CreateEditDialogs({
	close,
	createMutation,
	dialog,
	setDialog,
	updateMutation,
}: { close: CloseHandler } & Pick<
	UsersTabDialogsProps,
	'createMutation' | 'dialog' | 'setDialog' | 'updateMutation'
>) {
	return (
		<>
			<CreateUserDialog
				isOpen={dialog?.type === 'create'}
				isPending={createMutation.isPending}
				onCreate={(form: CreateUserInput) =>
					createMutation.mutate(form, {
						onSuccess: () => setDialog(null),
					})
				}
				onOpenChange={close}
			/>

			<EditUserDialog
				isOpen={dialog?.type === 'edit'}
				isPending={updateMutation.isPending}
				onOpenChange={close}
				onUpdate={(id, input) =>
					updateMutation.mutate(
						{ id, input: input },
						{ onSuccess: () => setDialog(null) },
					)
				}
				user={dialog?.type === 'edit' ? dialog.user : null}
			/>
		</>
	);
}

function BulkDialogs({
	bulkDeleteMutation,
	bulkRoleMutation,
	close,
	dialog,
	handleBulkDelete,
	handleBulkRoleUpdate,
	selectedRows,
	setDialog,
}: { close: CloseHandler } & Pick<
	UsersTabDialogsProps,
	| 'bulkDeleteMutation'
	| 'bulkRoleMutation'
	| 'dialog'
	| 'handleBulkDelete'
	| 'handleBulkRoleUpdate'
	| 'selectedRows'
	| 'setDialog'
>) {
	return (
		<>
			<BulkDeleteDialog
				isPending={bulkDeleteMutation.isPending}
				onConfirm={handleBulkDelete}
				onOpenChange={close}
				open={dialog?.type === 'bulkDelete'}
				selectedRows={selectedRows}
			/>

			<BulkRoleDialog
				isPending={bulkRoleMutation.isPending}
				newRole={dialog?.type === 'bulkRole' ? dialog.newRole : 'OPERATOR'}
				onConfirm={handleBulkRoleUpdate}
				onOpenChange={close}
				onRoleChange={(role) => setDialog({ newRole: role, type: 'bulkRole' })}
				open={dialog?.type === 'bulkRole'}
				selectedRows={selectedRows}
			/>
		</>
	);
}

function AccountDialogs({ close, dialog }: { close: CloseHandler; dialog: DialogState }) {
	return (
		<>
			<ResetPasswordDialog
				isOpen={dialog?.type === 'resetPassword'}
				onOpenChange={close}
				user={dialog?.type === 'resetPassword' ? dialog.user : null}
			/>

			<ImpersonateDialog
				isOpen={dialog?.type === 'impersonate'}
				onOpenChange={close}
				user={dialog?.type === 'impersonate' ? dialog.user : null}
			/>
		</>
	);
}

/** The Users tab's create, edit, delete, bulk, reset-password and impersonate dialogs. */
export function UsersTabDialogs(props: UsersTabDialogsProps) {
	const { deleteMutation, dialog } = props;
	const close: CloseHandler = (open) => {
		if (!open) props.setDialog(null);
	};
	return (
		<>
			<CreateEditDialogs {...props} close={close} />
			<DeleteUserDialog
				isOpen={dialog?.type === 'delete'}
				isPending={deleteMutation.isPending}
				onConfirm={(id) => deleteMutation.mutate(id)}
				onOpenChange={close}
				user={dialog?.type === 'delete' ? dialog.user : null}
			/>
			<BulkDialogs {...props} close={close} />
			<AccountDialogs close={close} dialog={props.dialog} />
		</>
	);
}
