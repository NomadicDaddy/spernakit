import type { User } from '@/api/types';

import { RoleSelector } from '@/components/shared/RoleSelector';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { ROLES } from '@/types/roles';

type BulkRoleDialogProps = {
	isPending: boolean;
	newRole: string;
	onConfirm: () => void;
	onOpenChange: (open: boolean) => void;
	onRoleChange: (role: string) => void;
	open: boolean;
	selectedRows: User[];
};

function BulkRoleDialog({
	isPending,
	newRole,
	onConfirm,
	onOpenChange,
	onRoleChange,
	open,
	selectedRows,
}: BulkRoleDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Change role for {selectedRows.length} users</DialogTitle>
					<DialogDescription>
						Select a new role to assign. Users with equal or higher roles will be
						skipped.
					</DialogDescription>
				</DialogHeader>
				<RoleSelector onValueChange={onRoleChange} roles={ROLES} value={newRole} />
				<DialogFooter>
					<Button disabled={isPending} onClick={onConfirm}>
						{isPending ? 'Updating…' : 'Update Roles'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export { BulkRoleDialog };
