import { LayoutGrid, Plus, Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { EmptyState } from '@/components/shared/EmptyState';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';
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
							<Upload aria-hidden="true" className="size-4" />
							Import
						</Button>
						<Button
							onClick={() => setDialog({ kind: 'template' })}
							size="sm"
							variant="outline">
							<LayoutGrid aria-hidden="true" className="size-4" />
							From Template
						</Button>
						<Button onClick={() => setDialog({ kind: 'create' })} size="sm">
							<Plus aria-hidden="true" className="size-4" />
							New Dashboard
						</Button>
					</>
				)}
			</PageHeader>

			{isLoading ? (
				<DashboardCardSkeleton cardCount={3} />
			) : !dashboards?.data.length ? (
				/*
				 * No action pair here. "From Template" and "New Dashboard" rendered twice in one
				 * viewport — once in the page header and again ~320px below inside this panel —
				 * so two identical blue primaries competed on a page whose whole convention is
				 * one primary per header. The panel sits directly under the header that owns
				 * them, so the description points at those controls instead of duplicating them.
				 */
				<EmptyState
					description={
						canMutate
							? 'Use New Dashboard to start from scratch, or From Template for a ready-made layout.'
							: 'No dashboards have been shared with you yet.'
					}
					icon={LayoutGrid}
					title="No custom dashboards yet"
				/>
			) : (
				/*
				 * The ladder is shifted up one step, and a fourth column added at `2xl`. Column
				 * count was picked off the viewport while the grid lives inside a canvas the 240px
				 * sidebar and 24px padding have already shrunk: at a 1024 viewport the `lg:` step
				 * fired against 728px of real canvas, giving 232px cards whose titles wrapped to
				 * three lines and grew the card from 102px to 170px for identical content. At the
				 * top end the grid stopped at three columns with 1472px available, so cards
				 * stretched to 480px around 248px of content.
				 *
				 * `role="list"` because these are visually a list of items but structurally bare
				 * divs — assistive tech got no count and no item boundaries.
				 */
				<div
					className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4"
					role="list">
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
				variant="destructive"
			/>
		</div>
	);
}

export { DashboardListPage };
