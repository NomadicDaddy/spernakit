import type { Layout } from 'react-grid-layout';

import { useRef, useState } from 'react';

import type { DashboardWidget, DashboardWithWidgets } from '@/api/dashboards';

import { getWidgetMinRows, WIDGET_HEIGHT_MAX } from '@/pages/dashboards/widgetSize';

export const DASHBOARD_ROW_HEIGHT = 80;
export const DASHBOARD_COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

/**
 * Builds the grid layout, applying each widget type's row floor from `WIDGET_MIN_ROWS`.
 *
 * `minH` gives react-grid-layout the floor so a resize handle stops there, and `Math.max` raises
 * any height already stored below it — a dashboard saved before the floor existed still renders
 * its widgets tall enough to show their own values.
 *
 * `maxH` is the other half of the same job, against the server's ceiling rather than the type's
 * floor: a resize gesture writes its result straight back, so without it the handle is a way to
 * store a height the API now rejects. `Math.min` clamps what is drawn for a dashboard saved before
 * the ceiling existed, which would otherwise render past the bottom of the page.
 *
 * All three are read-time repairs and none is written back. Save reads geometry out of `layoutMap`,
 * which carries only the widgets a gesture actually moved, so a widget nobody touched keeps the
 * height the server holds for it however tall it had to be drawn.
 */
function widgetsToLayout(widgets: DashboardWidget[]) {
	return widgets.map((w) => {
		const minH = getWidgetMinRows(w.widgetType);
		return {
			h: Math.min(Math.max(w.height, minH), WIDGET_HEIGHT_MAX),
			i: String(w.id),
			maxH: WIDGET_HEIGHT_MAX,
			minH,
			w: w.width,
			x: w.col,
			y: w.row,
		};
	});
}

/**
 * Identifies the widget set a layout was built against.
 *
 * Not the dashboard id: `updateDashboard` soft-deletes every widget and re-inserts it, so each save,
 * add and remove hands back the same dashboard carrying widgets with brand new ids. A layout keyed
 * to the ids that went in no longer matches any child, react-grid-layout treats all of them as
 * unplaced and draws the whole dashboard as a column of 1x1 tiles until the next reload.
 *
 * The ids are sorted so the key describes the set rather than the order the server happened to
 * return it in, and a background refetch of an unchanged dashboard leaves the layout alone.
 */
function widgetSetKey(dashboard: DashboardWithWidgets | undefined) {
	if (!dashboard) return '';
	const ids = dashboard.widgets.map((w) => w.id).sort((a, b) => a - b);
	return `${String(dashboard.id)}:${ids.join(',')}`;
}

/** The four fields a save persists. Everything else on a layout item is presentational. */
function sameGeometry(a: Layout[0], b: Layout[0]) {
	return a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
}

export function useDashboardLayout(dashboard: DashboardWithWidgets | undefined) {
	const [prevWidgetSet, setPrevWidgetSet] = useState(() => widgetSetKey(dashboard));
	const [currentLayout, setCurrentLayout] = useState<Layout>(() =>
		dashboard ? widgetsToLayout(dashboard.widgets) : [],
	);
	/*
	 * The widgets a user gesture actually moved, resized or nudged — and the only ones a save
	 * writes geometry for.
	 *
	 * What is on screen is not the same thing as what the user arranged. `<Responsive>` reflows the
	 * stored layout into whatever column count the container is wide enough for, and renders that
	 * reflow rather than what was stored; `widgetsToLayout` raises heights stored below their
	 * type's floor. Both used to reach the server, because every mutation read its
	 * geometry back out of the whole layout: opening a dashboard at 1024px and renaming it rewrote
	 * every widget's position to the six-column reflow, and any widget stored at height 1 came back
	 * at its floor. Persisting only what a gesture touched leaves the rest exactly as it was stored.
	 */
	const [dirtyIds, setDirtyIds] = useState<ReadonlySet<string>>(() => new Set());
	/*
	 * The layout as it stood when the current drag or resize began, so `commitLayoutEdit` can tell
	 * which items the gesture changed. A ref, not state: it is read once at the end of a gesture and
	 * rendering never depends on it.
	 */
	const gestureStart = useRef<Layout | null>(null);

	/*
	 * React-recommended pattern: adjust state during render when props change.
	 * https://react.dev/reference/react/useState#storing-information-from-previous-renders
	 *
	 * Compare by `widgetSetKey`, not by reference, so a TanStack Query background refetch that hands
	 * back an equivalent dashboard under a new object reference does not discard the arrangement the
	 * user is in the middle of — and so the layout is rebuilt when a mutation replaces the widget
	 * rows, which is the only other time the ids it is keyed to can change.
	 *
	 * Clearing `dirtyIds` here is right in both cases: a new widget set only arrives after the server
	 * has accepted a save, so nothing is left pending against it.
	 */
	const widgetSet = widgetSetKey(dashboard);
	if (widgetSet !== prevWidgetSet) {
		setPrevWidgetSet(widgetSet);
		setCurrentLayout(dashboard ? widgetsToLayout(dashboard.widgets) : []);
		setDirtyIds(new Set());
	}

	const layoutMap = new Map(
		currentLayout.filter((item) => dirtyIds.has(item.i)).map((item) => [item.i, item]),
	);

	/** Records the pre-gesture layout. Wired to the grid's drag and resize start callbacks. */
	const handleGestureStart = (layout: Layout) => {
		gestureStart.current = layout;
	};

	/**
	 * Ends a gesture: everything it moved becomes persistable, everything else stays as stored.
	 *
	 * The comparison is against the layout the gesture started from rather than against the stored
	 * one, so a widget displaced by the drag counts as edited — the user watched it move — while a
	 * widget that only sits where a narrow breakpoint put it does not.
	 *
	 * The items it changed are merged into `currentLayout` one at a time rather than replacing it
	 * wholesale, because `newLayout` is whatever the grid is currently showing, and at any
	 * breakpoint below `lg` that is the reflow: every widget clamped to the column count the
	 * container was wide enough for. Writing it back in full destroyed the arrangement it was
	 * derived from. `currentLayout` is the layout handed to `<Responsive>` under all five
	 * breakpoint keys, so once it held the six-column reflow, widening the window again
	 * re-rendered from the clamped widths and the dashboard stayed collapsed until a reload
	 * refetched the stored rows. It is also what a save reads through `layoutMap`, so one drag
	 * after that round trip would have persisted a clamped width and made the loss permanent.
	 */
	const commitLayoutEdit = (newLayout: Layout) => {
		const before = new Map(
			(gestureStart.current ?? currentLayout).map((item) => [item.i, item]),
		);
		gestureStart.current = null;
		const changed = new Map(
			newLayout
				.filter((item) => {
					const prior = before.get(item.i);
					return !prior || !sameGeometry(prior, item);
				})
				.map((item) => [item.i, item]),
		);
		if (changed.size === 0) return;
		setDirtyIds((previous) => new Set([...previous, ...changed.keys()]));
		setCurrentLayout((previous) =>
			previous.map((item) => {
				const next = changed.get(item.i);
				return next ? { ...item, h: next.h, w: next.w, x: next.x, y: next.y } : item;
			}),
		);
	};

	/** Drops unsaved edits and returns to the stored arrangement. Cancel, not Save. */
	const resetLayout = () => {
		setCurrentLayout(dashboard ? widgetsToLayout(dashboard.widgets) : []);
		setDirtyIds(new Set());
	};

	/**
	 * Marks the current arrangement as the stored one after a save succeeds.
	 *
	 * Not `resetLayout`: the refetch it was invalidated by has not landed yet, so rebuilding from
	 * `dashboard.widgets` here would redraw the pre-save geometry for a frame.
	 */
	const clearLayoutEdits = () => {
		setDirtyIds(new Set());
	};

	return {
		clearLayoutEdits,
		COLS: DASHBOARD_COLS,
		commitLayoutEdit,
		currentLayout,
		handleGestureStart,
		layoutMap,
		resetLayout,
		ROW_HEIGHT: DASHBOARD_ROW_HEIGHT,
	};
}
