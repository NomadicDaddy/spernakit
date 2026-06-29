import type { KeyboardEvent } from 'react';
import type { Layout } from 'react-grid-layout';

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, GripVertical, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Responsive } from 'react-grid-layout';

import type { DashboardWithWidgets } from '@/api/dashboards';

import { ConfirmAlertDialog } from '@/components/shared/ConfirmAlertDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DASHBOARD_COLS, DASHBOARD_ROW_HEIGHT } from '@/hooks/dashboards/useDashboardLayout';

import { DashboardWidgetRenderer } from './dashboard-widgets/DashboardWidgetRenderer';

import 'react-grid-layout/css/styles.css';

interface DashboardGridLayout {
	containerRef: React.RefObject<HTMLDivElement | null>;
	currentLayout: Layout;
	width: number | undefined;
}

interface DashboardGridData {
	canMutate: boolean;
	dashboard: DashboardWithWidgets;
	editMode: boolean;
}

interface DashboardGridHandlers {
	onAddWidgetClick: () => void;
	onLayoutChange: (layout: Layout) => void;
	onRemoveWidget: (widgetId: number) => void;
}

interface DashboardGridProps {
	data: DashboardGridData;
	handlers: DashboardGridHandlers;
	layout: DashboardGridLayout;
}

type MoveDirection = 'down' | 'left' | 'right' | 'up';

const RESPONSIVE_BREAKPOINTS = [
	{ cols: DASHBOARD_COLS.lg, minWidth: 1200 },
	{ cols: DASHBOARD_COLS.md, minWidth: 996 },
	{ cols: DASHBOARD_COLS.sm, minWidth: 768 },
	{ cols: DASHBOARD_COLS.xs, minWidth: 480 },
	{ cols: DASHBOARD_COLS.xxs, minWidth: 0 },
] as const;

function getColumnCount(width: number | undefined) {
	return RESPONSIVE_BREAKPOINTS.find((breakpoint) => (width || 1200) >= breakpoint.minWidth)
		?.cols;
}

export function DashboardGrid({ data, handlers, layout }: DashboardGridProps) {
	const { canMutate, dashboard, editMode } = data;
	const { onAddWidgetClick, onLayoutChange, onRemoveWidget } = handlers;
	const { containerRef, currentLayout, width } = layout;
	const [removeWidgetId, setRemoveWidgetId] = useState<null | number>(null);
	const columnCount = getColumnCount(width) || DASHBOARD_COLS.lg;

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

		onLayoutChange(nextLayout);
	};

	const handleMoveKeyDown = (
		event: KeyboardEvent<HTMLButtonElement>,
		widgetId: number,
		direction: MoveDirection
	) => {
		if (event.key !== 'Enter' && event.key !== ' ') return;

		event.preventDefault();
		moveWidget(widgetId, direction);
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
			/>
			{dashboard.widgets.length === 0 ? (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-12">
						<Plus aria-hidden="true" className="text-muted-foreground mb-4 size-12" />
						<h2 className="text-lg font-semibold">No widgets yet</h2>
						<p className="text-muted-foreground mt-1 text-sm">
							{canMutate
								? 'Switch to edit mode and add widgets to your dashboard.'
								: 'This dashboard has no widgets yet.'}
						</p>
						{canMutate && (
							<Button className="mt-4" onClick={onAddWidgetClick} size="sm">
								<Plus aria-hidden="true" className="mr-2 size-4" />
								Add Widget
							</Button>
						)}
					</CardContent>
				</Card>
			) : (
				<div ref={containerRef}>
					<Responsive
						breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
						cols={DASHBOARD_COLS}
						dragConfig={{
							enabled: editMode,
							handle: '.widget-drag-handle',
						}}
						layouts={{ lg: currentLayout }}
						onLayoutChange={onLayoutChange}
						resizeConfig={{ enabled: editMode }}
						rowHeight={DASHBOARD_ROW_HEIGHT}
						width={width || 1200}>
						{dashboard.widgets.map((widget) => {
							const widgetLayout = currentLayout.find(
								(item) => item.i === String(widget.id)
							);
							const canMoveLeft = widgetLayout ? widgetLayout.x > 0 : false;
							const canMoveRight = widgetLayout
								? widgetLayout.x + widgetLayout.w < columnCount
								: false;
							const canMoveUp = widgetLayout ? widgetLayout.y > 0 : false;
							const widgetTitle = widget.title || `widget ${widget.id}`;

							return (
								<div className="relative" key={String(widget.id)}>
									{editMode && (
										<>
											<button
												aria-label="Drag to reorder widget"
												className="widget-drag-handle absolute top-1 left-1 z-10 cursor-grab rounded p-0.5 opacity-50 hover:opacity-100"
												tabIndex={0}
												type="button">
												<GripVertical
													aria-hidden="true"
													className="size-3.5"
												/>
											</button>
											<div className="absolute top-1 left-7 z-10 flex gap-1">
												<button
													aria-label={`Move ${widgetTitle} left`}
													className="rounded p-0.5 opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
													disabled={!canMoveLeft}
													onClick={() => moveWidget(widget.id, 'left')}
													onKeyDown={(event) =>
														handleMoveKeyDown(event, widget.id, 'left')
													}
													type="button">
													<ArrowLeft
														aria-hidden="true"
														className="size-3.5"
													/>
												</button>
												<button
													aria-label={`Move ${widgetTitle} right`}
													className="rounded p-0.5 opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
													disabled={!canMoveRight}
													onClick={() => moveWidget(widget.id, 'right')}
													onKeyDown={(event) =>
														handleMoveKeyDown(event, widget.id, 'right')
													}
													type="button">
													<ArrowRight
														aria-hidden="true"
														className="size-3.5"
													/>
												</button>
												<button
													aria-label={`Move ${widgetTitle} up`}
													className="rounded p-0.5 opacity-50 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-25"
													disabled={!canMoveUp}
													onClick={() => moveWidget(widget.id, 'up')}
													onKeyDown={(event) =>
														handleMoveKeyDown(event, widget.id, 'up')
													}
													type="button">
													<ArrowUp
														aria-hidden="true"
														className="size-3.5"
													/>
												</button>
												<button
													aria-label={`Move ${widgetTitle} down`}
													className="rounded p-0.5 opacity-50 hover:opacity-100"
													onClick={() => moveWidget(widget.id, 'down')}
													onKeyDown={(event) =>
														handleMoveKeyDown(event, widget.id, 'down')
													}
													type="button">
													<ArrowDown
														aria-hidden="true"
														className="size-3.5"
													/>
												</button>
											</div>
											<button
												aria-label="Remove widget"
												className="absolute top-1 right-1 z-10 rounded p-0.5 opacity-50 hover:opacity-100"
												onClick={() => setRemoveWidgetId(widget.id)}
												type="button">
												<X aria-hidden="true" className="size-3.5" />
											</button>
										</>
									)}
									<DashboardWidgetRenderer widget={widget} />
								</div>
							);
						})}
					</Responsive>
				</div>
			)}
		</>
	);
}
