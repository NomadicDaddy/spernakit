import type { Layout } from 'react-grid-layout';

import { useState } from 'react';

import type { DashboardWidget, DashboardWithWidgets } from '@/api/dashboards';

export const DASHBOARD_ROW_HEIGHT = 80;
export const DASHBOARD_COLS = { lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 };

function widgetsToLayout(widgets: DashboardWidget[]) {
	return widgets.map((w) => ({
		h: w.height,
		i: String(w.id),
		w: w.width,
		x: w.col,
		y: w.row,
	}));
}

export function useDashboardLayout(dashboard: DashboardWithWidgets | undefined) {
	const [prevDashboardId, setPrevDashboardId] = useState(dashboard?.id);
	const [currentLayout, setCurrentLayout] = useState(() =>
		dashboard ? widgetsToLayout(dashboard.widgets) : []
	);

	// React-recommended pattern: adjust state during render when props change
	// https://react.dev/reference/react/useState#storing-information-from-previous-renders
	// Compare by dashboard ID, not by reference, to avoid resetting layout
	// on TanStack Query background refetches that return a new object reference.
	if (dashboard?.id !== prevDashboardId) {
		setPrevDashboardId(dashboard?.id);
		setCurrentLayout(dashboard ? widgetsToLayout(dashboard.widgets) : []);
	}

	const layoutMap = new Map(currentLayout.map((item) => [item.i, item]));

	const handleLayoutChange = (newLayout: Layout) => {
		setCurrentLayout([...newLayout]);
	};

	return {
		COLS: DASHBOARD_COLS,
		currentLayout,
		handleLayoutChange,
		layoutMap,
		ROW_HEIGHT: DASHBOARD_ROW_HEIGHT,
	};
}
