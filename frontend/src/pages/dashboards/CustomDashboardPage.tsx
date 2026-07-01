import { useMutation, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { getDashboard, shareDashboard } from '@/api/dashboards';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardLayout } from '@/hooks/dashboards/useDashboardLayout';
import { useDashboardWidgets } from '@/hooks/dashboards/useDashboardWidgets';
import { useAuthorization } from '@/hooks/useAuthorization';
import { useContainerWidth } from '@/hooks/useContainerWidth';

import { AddWidgetDialog } from './AddWidgetDialog';
import { DashboardCardSkeleton } from './DashboardCardSkeleton';
import { DashboardEditHeader } from './DashboardEditHeader';
import { DashboardGrid } from './DashboardGrid';
import { DashboardViewHeader } from './DashboardViewHeader';
import { RenameDashboardDialog } from './RenameDashboardDialog';
import { ShareDashboardDialog } from './ShareDashboardDialog';

type DialogState =
	{ kind: 'addWidget' } | { kind: 'none' } | { kind: 'rename' } | { kind: 'share'; url: string };

function CustomDashboardPage() {
	const { id } = useParams<{ id: string }>();
	const { isAdmin, isOperator } = useAuthorization();
	const canMutate = isOperator();
	const dashboardId = Number(id);
	const [containerRef, width] = useContainerWidth();

	const [editMode, setEditMode] = useState(false);
	const [dialog, setDialog] = useState<DialogState>({ kind: 'none' });
	const closeDialog = () => setDialog({ kind: 'none' });

	const { data, isLoading } = useQuery({
		enabled: !Number.isNaN(dashboardId),
		queryFn: () => getDashboard(dashboardId),
		queryKey: ['dashboard', dashboardId],
	});

	const dashboard = data?.data;

	const { currentLayout, handleLayoutChange, layoutMap } = useDashboardLayout(dashboard);

	const {
		handleAddWidget,
		handleRemoveWidget,
		handleRename,
		handleSave,
		newWidget,
		saveMutation,
		setNewWidget,
	} = useDashboardWidgets({
		dashboard,
		dashboardId,
		dashboardName: dashboard?.name || '',
		layoutMap,
		onAddWidgetSuccess: closeDialog,
		onSaveSuccess: () => setEditMode(false),
	});

	const shareMutation = useMutation({
		mutationFn: () => shareDashboard(dashboardId),
		onSuccess: (result) => {
			const token = result.data.shareToken;
			setDialog({
				kind: 'share',
				url: `${window.location.origin}/dashboards/shared/${token}`,
			});
			toast.success('Share link generated');
		},
	});

	const handleRenameClick = () => {
		setDialog({ kind: 'rename' });
	};

	const copyShareUrl = () => {
		if (dialog.kind === 'share') {
			void navigator.clipboard.writeText(dialog.url);
			toast.success('Link copied to clipboard');
		}
	};

	const handleShareClick = () => {
		shareMutation.mutate();
	};

	if (isLoading) {
		return (
			<div className="space-y-6 p-6">
				<Skeleton className="h-8 w-64" />
				<DashboardCardSkeleton cardCount={4} showGrid={true} />
			</div>
		);
	}

	if (!dashboard) {
		return (
			<div className="flex flex-col items-center justify-center p-12">
				<h2 className="text-lg font-semibold">Dashboard not found</h2>
				<Button asChild className="mt-4" variant="outline">
					<Link to="/dashboards">Back to dashboards</Link>
				</Button>
			</div>
		);
	}

	return (
		<div className="space-y-4 p-6">
			{editMode ? (
				<DashboardEditHeader
					backTo="/dashboards"
					canMutate={canMutate}
					canShare={isAdmin()}
					dashboardName={dashboard.name}
					isSavePending={saveMutation.isPending}
					isSharePending={shareMutation.isPending}
					onAddWidget={() => setDialog({ kind: 'addWidget' })}
					onCancel={() => setEditMode(false)}
					onRename={handleRenameClick}
					onSave={handleSave}
					onShare={handleShareClick}
					widgetCount={dashboard.widgets.length}
				/>
			) : (
				<DashboardViewHeader
					backTo="/dashboards"
					canMutate={canMutate}
					canShare={isAdmin()}
					dashboardName={dashboard.name}
					isSharePending={shareMutation.isPending}
					onEdit={() => setEditMode(true)}
					onRename={handleRenameClick}
					onShare={handleShareClick}
					widgetCount={dashboard.widgets.length}
				/>
			)}

			<DashboardGrid
				data={{ canMutate, dashboard, editMode }}
				handlers={{
					onAddWidgetClick: () => {
						setEditMode(true);
						setDialog({ kind: 'addWidget' });
					},
					onLayoutChange: handleLayoutChange,
					onRemoveWidget: handleRemoveWidget,
				}}
				layout={{ containerRef, currentLayout, width }}
			/>

			<AddWidgetDialog
				isOpen={dialog.kind === 'addWidget'}
				isPending={saveMutation.isPending}
				newWidget={newWidget}
				onAddWidget={handleAddWidget}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				onUpdateWidget={setNewWidget}
			/>

			<RenameDashboardDialog
				initialName={dashboard.name}
				isOpen={dialog.kind === 'rename'}
				isPending={saveMutation.isPending}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				onRename={handleRename}
			/>

			<ShareDashboardDialog
				isOpen={dialog.kind === 'share'}
				onCopy={copyShareUrl}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				shareUrl={dialog.kind === 'share' ? dialog.url : ''}
			/>
		</div>
	);
}

export { CustomDashboardPage };
