import type { DashboardTemplate } from '@/api/dashboards';

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';

interface TemplateDashboardDialogProps {
	isOpen: boolean;
	onOpenChange: (open: boolean) => void;
	templateMutation: { isPending: boolean; mutate: (id: string) => void };
	templates: DashboardTemplate[];
}

/**
 * Template dashboard dialog component.
 */
export function TemplateDashboardDialog({
	isOpen,
	onOpenChange,
	templateMutation,
	templates,
}: TemplateDashboardDialogProps) {
	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Create from Template</DialogTitle>
					<DialogDescription>
						Choose a pre-built template to start with. You can customize it after
						creation.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2 py-4">
					{templates?.map((t) => (
						<button
							className="w-full rounded-md border p-3 text-left transition-colors hover:bg-accent"
							disabled={templateMutation?.isPending}
							key={t.id}
							onClick={() => {
								templateMutation.mutate(t.id);
								onOpenChange(false);
							}}
							type="button">
							<div className="font-medium">{t.name}</div>
							<div className="text-sm text-muted-foreground">
								{t.widgetCount} widgets
							</div>
						</button>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
