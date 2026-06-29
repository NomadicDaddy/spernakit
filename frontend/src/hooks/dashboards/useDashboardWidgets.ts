import type { Layout } from 'react-grid-layout';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { toast } from 'sonner';

import type { WidgetInput } from '@/api/dashboards';
import type { DashboardWidget, DashboardWithWidgets } from '@/api/dashboards';

import { updateDashboard } from '@/api/dashboards';

const DEFAULT_NEW_WIDGET: WidgetInput = {
	col: 0,
	height: 2,
	metricType: 'cpu_usage',
	row: 0,
	timeRange: '6h',
	title: '',
	widgetType: 'stat_card',
	width: 3,
};

function mapWidgetsToInput(
	widgets: DashboardWidget[],
	layoutMap?: Map<string, Layout[0]>
): WidgetInput[] {
	return widgets.map((w) => {
		const layoutItem = layoutMap?.get(String(w.id));
		return {
			col: layoutItem?.x ?? w.col,
			height: layoutItem?.h ?? w.height,
			metricType: w.metricType,
			...(w.options ? { options: w.options } : {}),
			refreshInterval: w.refreshInterval,
			row: layoutItem?.y ?? w.row,
			timeRange: w.timeRange,
			title: w.title,
			widgetType: w.widgetType,
			width: layoutItem?.w ?? w.width,
		};
	});
}

interface UseDashboardWidgetsOptions {
	dashboard: DashboardWithWidgets | undefined;
	dashboardId: number;
	dashboardName: string;
	layoutMap: Map<string, Layout[0]>;
	onAddWidgetSuccess?: () => void;
	onSaveSuccess: () => void;
}

export function useDashboardWidgets({
	dashboard,
	dashboardId,
	dashboardName,
	layoutMap,
	onAddWidgetSuccess,
	onSaveSuccess,
}: UseDashboardWidgetsOptions) {
	const queryClient = useQueryClient();

	const [newWidget, setNewWidget] = useState<WidgetInput>(() => ({ ...DEFAULT_NEW_WIDGET }));

	const saveMutation = useMutation({
		mutationFn: (input: { name: string; widgets: WidgetInput[] }) =>
			updateDashboard(dashboardId, input),
		onSuccess: () => {
			void queryClient.invalidateQueries({ queryKey: ['dashboard', dashboardId] });
			void queryClient.invalidateQueries({ queryKey: ['dashboards'] });
			toast.success('Dashboard saved');
			onSaveSuccess();
		},
	});

	const handleSave = () => {
		if (!dashboard) return;
		saveMutation.mutate({
			name: dashboardName,
			widgets: mapWidgetsToInput(dashboard.widgets, layoutMap),
		});
	};

	const handleAddWidget = () => {
		if (!dashboard || !newWidget.title.trim()) return;

		const existingWidgets = mapWidgetsToInput(dashboard.widgets, layoutMap);
		const maxRow = existingWidgets.reduce((max, w) => Math.max(max, w.row + w.height), 0);
		const widget: WidgetInput = {
			...newWidget,
			col: 0,
			row: maxRow,
			title: newWidget.title.trim(),
		};

		saveMutation.mutate(
			{
				name: dashboardName,
				widgets: [...existingWidgets, widget],
			},
			{
				onSuccess: () => {
					onAddWidgetSuccess?.();
					setNewWidget(() => ({ ...DEFAULT_NEW_WIDGET }));
				},
			}
		);
	};

	const handleRemoveWidget = (widgetId: number) => {
		if (!dashboard) return;
		const filtered = dashboard.widgets.filter((w) => w.id !== widgetId);
		saveMutation.mutate({
			name: dashboardName,
			widgets: mapWidgetsToInput(filtered, layoutMap),
		});
	};

	const handleRename = (name: string) => {
		if (!dashboard || !name.trim()) return;
		saveMutation.mutate({
			name: name.trim(),
			widgets: mapWidgetsToInput(dashboard.widgets, layoutMap),
		});
	};

	return {
		handleAddWidget,
		handleRemoveWidget,
		handleRename,
		handleSave,
		newWidget,
		saveMutation,
		setNewWidget,
	};
}
