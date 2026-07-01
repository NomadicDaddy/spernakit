import { FormInputDialog } from './FormInputDialog';

interface CreateDashboardDialogProps {
	createMutation: { isPending: boolean; mutate: (name: string) => void };
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * Create dashboard dialog component.
 */
export function CreateDashboardDialog({
	createMutation,
	isOpen,
	onOpenChange,
}: CreateDashboardDialogProps) {
	return (
		<FormInputDialog
			description="Give your new dashboard a name. You can add widgets after creation."
			fieldLabel="Name"
			isOpen={isOpen}
			isPending={createMutation.isPending}
			onOpenChange={onOpenChange}
			onSubmit={(name) => createMutation.mutate(name)}
			placeholder="My Dashboard"
			submitLabel="Create"
			title="Create Dashboard"
		/>
	);
}
