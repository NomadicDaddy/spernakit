import type { RefCallback } from 'react';
import type { Layout } from 'react-grid-layout';

import { Pencil } from 'lucide-react';
import { useState } from 'react';
import { Responsive } from 'react-grid-layout';

import type { DashboardWithWidgets } from '@/api/dashboards';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { DASHBOARD_COLS, DASHBOARD_ROW_HEIGHT } from '@/hooks/dashboards/useDashboardLayout';
import { cn } from '@/lib/utils';

import type { MoveDirection } from './DashboardWidgetEditBar';

import { DashboardWidgetRenderer } from './dashboard-widgets/DashboardWidgetRenderer';
import { DashboardEmptyWidgets } from './DashboardEmptyWidgets';
import { DashboardWidgetEditBar } from './DashboardWidgetEditBar';

import 'react-grid-layout/css/styles.css';

// After the library sheet, so the app-token overrides win on order. See the file's own header.
import './dashboardGrid.css';

interface DashboardGridLayout {
	containerRef: RefCallback<HTMLDivElement>;
	currentLayout: Layout;
	width: number;
}

interface DashboardGridData {
	canMutate: boolean;
	dashboard: DashboardWithWidgets;
	editMode: boolean;
}

interface DashboardGridHandlers {
	onAddWidgetClick: () => void;
	onGestureStart: (layout: Layout) => void;
	onLayoutChange: (layout: Layout) => void;
	onLayoutEdit: (layout: Layout) => void;
	onRemoveWidget: (widgetId: number) => void;
}

interface DashboardGridProps {
	data: DashboardGridData;
	handlers: DashboardGridHandlers;
	layout: DashboardGridLayout;
}

/** Breakpoint minimums handed to `<Responsive>`, widest first. */
const DASHBOARD_BREAKPOINTS = { lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 };

const RESPONSIVE_BREAKPOINTS = [
	{ cols: DASHBOARD_COLS.lg, minWidth: DASHBOARD_BREAKPOINTS.lg },
	{ cols: DASHBOARD_COLS.md, minWidth: DASHBOARD_BREAKPOINTS.md },
	{ cols: DASHBOARD_COLS.sm, minWidth: DASHBOARD_BREAKPOINTS.sm },
	{ cols: DASHBOARD_COLS.xs, minWidth: DASHBOARD_BREAKPOINTS.xs },
	{ cols: DASHBOARD_COLS.xxs, minWidth: DASHBOARD_BREAKPOINTS.xxs },
] as const;

/**
 * The column count `<Responsive>` will itself pick for this width.
 *
 * The comparison is `>`, not `>=`, because that is the rule react-grid-layout applies internally:
 * a width equal to a breakpoint minimum belongs to the band *below* it, so exactly 1200px is `md`
 * (10 columns), not `lg` (12). This function drives the move-left/move-right clamps, and a clamp
 * computed against a different column count than the grid is laid out in lets a widget be nudged
 * past the right edge.
 */
function getColumnCount(width: number) {
	return (
		RESPONSIVE_BREAKPOINTS.find((breakpoint) => width > breakpoint.minWidth)?.cols ??
		DASHBOARD_COLS.xxs
	);
}

export function DashboardGrid({ data, handlers, layout }: DashboardGridProps) {
	const { canMutate, dashboard, editMode } = data;
	const { onAddWidgetClick, onGestureStart, onLayoutChange, onLayoutEdit, onRemoveWidget } =
		handlers;
	const { containerRef, currentLayout, width } = layout;
	const [removeWidgetId, setRemoveWidgetId] = useState<null | number>(null);
	const columnCount = getColumnCount(width);

	/*
	 * One stored layout, offered at every breakpoint. The dashboard persists a single set of
	 * widget positions, so there is no per-breakpoint layout to look up; supplying only `lg` meant
	 * that at any narrower breakpoint react-grid-layout synthesised a layout of its own and laid
	 * the dashboard out to positions the app had never stored. Handing it the stored layout under
	 * every key keeps what is on screen the thing the user is arranging.
	 *
	 * What that reflow produces is still not a saveable arrangement — six columns cannot express a
	 * twelve-column layout — so it arrives through `onLayoutChange`, which only redraws. Only the
	 * drag, resize and nudge callbacks below reach `onLayoutEdit`, and only what they touch is
	 * persisted.
	 */
	const layouts = {
		lg: currentLayout,
		md: currentLayout,
		sm: currentLayout,
		xs: currentLayout,
		xxs: currentLayout,
	};

	const moveWidget = (widgetId: number, direction: MoveDirection) => {
		const widgetKey = String(widgetId);
		const nextLayout = currentLayout.map((item) => ({ ...item }));
		const item = nextLayout.find((entry) => entry.i === widgetKey);

		if (!item) return;

		switch (direction) {
			case 'down':
				item.y += 1;
				break;
			case 'left':
				item.x = Math.max(0, item.x - 1);
				break;
			case 'right':
				item.x = Math.min(columnCount - item.w, item.x + 1);
				break;
			case 'up':
				item.y = Math.max(0, item.y - 1);
				break;
		}

		// A nudge is an edit, so it goes through `onLayoutEdit` like a drag does.
		onLayoutEdit(nextLayout);
	};

	return (
		<>
			<ConfirmAlertDialog
				confirmText="Remove"
				description="This widget will be removed from your dashboard. You can add it back later."
				isOpen={removeWidgetId !== null}
				onConfirm={() => {
					if (removeWidgetId !== null) {
						onRemoveWidget(removeWidgetId);
						setRemoveWidgetId(null);
					}
				}}
				onOpenChange={(open) => {
					if (!open) setRemoveWidgetId(null);
				}}
				title="Remove widget?"
				variant="destructive"
			/>
			{/*
			 * The mode banner. Says what the canvas is doing and what ends it — deliberately not
			 * "unsaved changes", because nothing here tracks whether the layout is actually dirty
			 * and a bar that claims edits the user has not made is worse than no bar.
			 */}
			{editMode && (
				<div className="mb-4 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/[0.06] px-3 py-2 text-sm text-muted-foreground">
					<Pencil aria-hidden="true" className="size-4 text-primary" />
					<span>
						<span className="font-medium text-foreground">Editing layout.</span> Drag,
						resize or nudge widgets, then Save to keep the arrangement.
					</span>
				</div>
			)}
			{dashboard.widgets.length === 0 ? (
				<DashboardEmptyWidgets
					canMutate={canMutate}
					editMode={editMode}
					onAddWidgetClick={onAddWidgetClick}
				/>
			) : (
				/*
				 * `<Responsive>` needs a pixel width, and it only gets a true one once the
				 * container is in the DOM and measured — so the grid waits for that measurement
				 * rather than rendering against a hard-coded fallback. The measurement is taken
				 * synchronously as the ref attaches, so this renders empty for no painted frame.
				 */
				<div ref={containerRef}>
					{width > 0 && (
						<Responsive
							breakpoints={DASHBOARD_BREAKPOINTS}
							cols={DASHBOARD_COLS}
							dragConfig={{
								enabled: editMode,
								handle: '.widget-drag-handle',
							}}
							layouts={layouts}
							onDragStart={onGestureStart}
							onDragStop={onLayoutEdit}
							onLayoutChange={onLayoutChange}
							onResizeStart={onGestureStart}
							onResizeStop={onLayoutEdit}
							resizeConfig={{ enabled: editMode }}
							rowHeight={DASHBOARD_ROW_HEIGHT}
							width={width}>
							{dashboard.widgets.map((widget) => {
								const widgetLayout = currentLayout.find(
									(item) => item.i === String(widget.id),
								);
								const canMoveLeft = widgetLayout ? widgetLayout.x > 0 : false;
								const canMoveRight = widgetLayout
									? widgetLayout.x + widgetLayout.w < columnCount
									: false;
								const canMoveUp = widgetLayout ? widgetLayout.y > 0 : false;
								const widgetTitle = widget.title || `widget ${widget.id}`;

								return (
									<div
										className={cn(
											'flex h-full flex-col',
											/*
											 * Edit mode has to look like edit mode. The cards kept
											 * identical framing, background and borders in both
											 * modes, so the only signal that the canvas was
											 * editable was the header button swap plus six faint
											 * glyphs — at a glance an editable dashboard was
											 * indistinguishable from a read-only one.
											 */
											editMode &&
												'rounded-xl border border-dashed border-primary/40 bg-primary/[0.03] p-1',
										)}
										key={String(widget.id)}>
										{editMode && (
											<DashboardWidgetEditBar
												canMoveLeft={canMoveLeft}
												canMoveRight={canMoveRight}
												canMoveUp={canMoveUp}
												onMove={(direction) =>
													moveWidget(widget.id, direction)
												}
												onRemove={() => setRemoveWidgetId(widget.id)}
												widgetTitle={widgetTitle}
											/>
										)}
										<div className="min-h-0 flex-1">
											<DashboardWidgetRenderer widget={widget} />
										</div>
									</div>
								);
							})}
						</Responsive>
					)}
				</div>
			)}
		</>
	);
}
