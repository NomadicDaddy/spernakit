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
		<FormInputDialog
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
