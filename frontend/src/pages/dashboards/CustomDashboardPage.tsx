import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';

import { getDashboard } from '@/api/dashboards';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useDashboardLayout } from '@/hooks/dashboards/useDashboardLayout';
import { useDashboardShare } from '@/hooks/dashboards/useDashboardShare';
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
	| { expiresAt: string; kind: 'share'; url: string }
	| { kind: 'addWidget' }
	| { kind: 'none' }
	| { kind: 'rename' };

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

	const {
		clearLayoutEdits,
		commitLayoutEdit,
		currentLayout,
		handleGestureStart,
		layoutMap,
		resetLayout,
	} = useDashboardLayout(dashboard);

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
		onSaveSuccess: () => {
			// What was edited is now what is stored, so nothing is pending for the next mutation to
			// carry — a rename after a save must not re-send the geometry a second time.
			clearLayoutEdits();
			setEditMode(false);
		},
	});

	const { isRevoking, isSharing, revoke, share, shareState } = useDashboardShare({
		dashboardId,
		enabled: isAdmin(),
		onShared: (url, expiresAt) => {
			setDialog({ expiresAt, kind: 'share', url });
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
		// Opening the dialog is the share call: the endpoint reuses a live token, so this shows the
		// existing link when there is one and creates one when there is not.
		share();
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
		<div className="space-y-6 p-6">
			{editMode ? (
				<DashboardEditHeader
					backTo="/dashboards"
					canMutate={canMutate}
					canShare={isAdmin()}
					dashboardName={dashboard.name}
					isSavePending={saveMutation.isPending}
					isSharePending={isSharing}
					onAddWidget={() => setDialog({ kind: 'addWidget' })}
					onCancel={() => {
						/*
						 * Cancel discards the arrangement instead of merely leaving edit mode.
						 * The layout used to survive it in component state, so a rename or an
						 * Add Widget minutes later saved the moves the user had just abandoned.
						 */
						resetLayout();
						setEditMode(false);
					}}
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
					isSharePending={isSharing}
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
					onGestureStart: handleGestureStart,
					onLayoutEdit: commitLayoutEdit,
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
				isActive={shareState?.isActive ?? false}
				isOpen={dialog.kind === 'share'}
				isRevoking={isRevoking}
				isSharing={isSharing}
				onCopy={copyShareUrl}
				onCreateNew={share}
				onOpenChange={(open) => {
					if (!open) closeDialog();
				}}
				onRevoke={revoke}
				shareUrl={dialog.kind === 'share' ? dialog.url : ''}
				{...(dialog.kind === 'share' ? { expiresAt: dialog.expiresAt } : {})}
			/>
		</div>
	);
}

export { CustomDashboardPage };
