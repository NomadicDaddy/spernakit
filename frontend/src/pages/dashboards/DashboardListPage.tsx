import { LayoutGrid, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDashboards } from '@/hooks/dashboards/useDashboards';
import { useAuthorization } from '@/hooks/useAuthorization';

import { CreateDashboardDialog } from './CreateDashboardDialog';
import { DashboardCard } from './DashboardCard';
import { DashboardCardSkeleton } from './DashboardCardSkeleton';
import { TemplateDashboardDialog } from './TemplateDashboardDialog';

type DialogState =
	{ id: number; kind: 'delete' } | { kind: 'create' } | { kind: 'none' } | { kind: 'template' };

/**
 * Lists all custom dashboards with create, import, export, template, and delete actions.
 */
function DashboardListPage() {
	const navigate = useNavigate();
	const { isOperator } = useAuthorization();
	const canMutate = isOperator();
	const {
		createMutation,
		dashboards,
		deleteMutation,
		fileInputRef,
		handleExport,
		handleImportFile,
		isLoading,
		templateMutation,
		templates,
	} = useDashboards({ onNavigate: (path) => void navigate(path) });

	const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
	const closeDialog = () => setDialog({ kind: 'none' });

	const handleDelete = () => {
		if (dialog.kind === 'delete') {
			deleteMutation.mutate(dialog.id);
		}
	};

	return (
		<div className="space-y-6 p-6">
			<PageHeader
				description="Create and manage custom monitoring dashboards"
				title="Custom Dashboards">
				{canMutate && (
					<>
						<input
							accept=".json"
							className="hidden"
							onChange={(e) => void handleImportFile(e)}
							ref={fileInputRef}
							type="file"
						/>
						<Button
							onClick={() => fileInputRef.current?.click()}
							size="sm"
							variant="outline">
							<Upload aria-hidden="true" className="mr-2 size-4" />
							Import
						</Button>
						<Button
							onClick={() => setDialog({ kind: 'template' })}
							size="sm"
							variant="outline">
							<LayoutGrid aria-hidden="true" className="mr-2 size-4" />
							From Template
						</Button>
						<Button onClick={() => setDialog({ kind: 'create' })} size="sm">
							<Plus aria-hidden="true" className="mr-2 size-4" />
							New Dashboard
						</Button>
					</>
				)}
			</PageHeader>

			{isLoading ? (
				<DashboardCardSkeleton cardCount={3} />
			) : !dashboards?.data.length ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<LayoutGrid
							aria-hidden="true"
							className="text-muted-foreground mb-4 size-12"
						/>
						<h2 className="text-lg font-semibold">No custom dashboards yet</h2>
						<p className="text-muted-foreground mt-1 text-sm">
							{canMutate
								? 'Create a dashboard from scratch or use a template to get started.'
								: 'No dashboards have been shared with you yet.'}
						</p>
						{canMutate && (
							<div className="mt-4 flex gap-2">
								<Button
									onClick={() => setDialog({ kind: 'template' })}
									size="sm"
									variant="outline">
									<LayoutGrid aria-hidden="true" className="mr-2 size-4" />
									From Template
								</Button>
								<Button onClick={() => setDialog({ kind: 'create' })} size="sm">
									<Plus aria-hidden="true" className="mr-2 size-4" />
									New Dashboard
								</Button>
							</div>
						)}
					</CardContent>
				</Card>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{dashboards.data.map((d) => (
						<DashboardCard
							canMutate={canMutate}
							dashboard={d}
							key={d.id}
							onDelete={() => setDialog({ id: d.id, kind: 'delete' })}
							onExport={handleExport}
						/>
					))}
				</div>
			)}

			<CreateDashboardDialog
				createMutation={createMutation}
				isOpen={dialog.kind === 'create'}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
			/>

			<TemplateDashboardDialog
				isOpen={dialog.kind === 'template'}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				templateMutation={templateMutation}
				templates={templates?.data ?? []}
			/>

			<ConfirmAlertDialog
				confirmText="Delete"
				description="This will permanently delete the dashboard and all its widgets. This action cannot be undone."
				isOpen={dialog.kind === 'delete'}
				onConfirm={handleDelete}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				title="Delete Dashboard"
			/>
		</div>
	);
}

export { DashboardListPage };
