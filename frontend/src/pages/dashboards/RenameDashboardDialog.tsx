import { FormInputDialog } from './FormInputDialog';

interface RenameDashboardDialogProps {
	initialName: string;
	isOpen: boolean;
	isPending: boolean;
	onOpenChange: (open: boolean) => void;
	onRename: (name: string) => void;
}

export function RenameDashboardDialog({
	initialName,
	isOpen,
	isPending,
	onOpenChange,
	onRename,
}: RenameDashboardDialogProps) {
	return (
		/*
		 * The description is not decoration here. Of the three dialogs this page opens, Rename was
		 * the only one without one — so its header block was a different height from its siblings'
		 * and it shipped with no `aria-describedby` target at all.
		 */
		<FormInputDialog
			description="Give this dashboard a new name."
			fieldLabel="Name"
			initialValue={initialName}
			isOpen={isOpen}
			isPending={isPending}
			onOpenChange={onOpenChange}
			onSubmit={onRename}
			submitLabel="Save"
			title="Rename Dashboard"
		/>
	);
}
