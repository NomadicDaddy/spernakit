import { useRef, useState } from 'react';

import type { MetricType, WidgetInput, WidgetType } from '@/api/dashboards';

import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

import { getWidgetHeightError, getWidgetMinRows, getWidgetWidthError } from './widgetSize';
import { WidgetSizeFields } from './WidgetSizeFields';

const WIDGET_TYPE_OPTIONS: { label: string; value: WidgetType }[] = [
	{ label: 'Stat Card', value: 'stat_card' },
	{ label: 'Gauge', value: 'gauge' },
	{ label: 'Line Chart', value: 'line_chart' },
	{ label: 'Bar Chart', value: 'bar_chart' },
	{ label: 'Health Status', value: 'health_status' },
	{ label: 'Alert List', value: 'alert_list' },
];

const METRIC_TYPE_OPTIONS: { label: string; value: MetricType }[] = [
	{ label: 'CPU Usage', value: 'cpu_usage' },
	{ label: 'Memory Usage', value: 'memory_usage' },
	{ label: 'Request Count', value: 'request_count' },
	{ label: 'Active Connections', value: 'active_connections' },
	{ label: 'Total Users', value: 'total_users' },
	{ label: 'Audit Events', value: 'audit_events' },
	{ label: 'Health Status', value: 'health_status' },
	{ label: 'System Alerts', value: 'system_alerts' },
	{ label: 'Business Events', value: 'business_events' },
	{ label: 'Health Checks', value: 'health_checks' },
];

/**
 * Line and bar charts render time-series numeric history from GET /system/metrics,
 * which only carries cpuUsage/memoryUsage data points. Constrain the metric dropdown
 * for those widget types so users cannot pick a metric that useChartData cannot plot.
 */
const TIME_SERIES_METRIC_VALUES: MetricType[] = ['cpu_usage', 'memory_usage'];

const TIME_RANGE_OPTIONS = ['1h', '6h', '12h', '24h', '7d', '30d'];

interface AddWidgetDialogProps {
	isOpen: boolean;
	isPending: boolean;
	newWidget: WidgetInput;
	onAddWidget: () => void;
	onOpenChange: (open: boolean) => void;
	onUpdateWidget: (widget: WidgetInput) => void;
}

export function AddWidgetDialog({
	isOpen,
	isPending,
	newWidget,
	onAddWidget,
	onOpenChange,
	onUpdateWidget,
}: AddWidgetDialogProps) {
	const titleInputRef = useRef<HTMLInputElement>(null);
	const widthInputRef = useRef<HTMLInputElement>(null);
	const heightInputRef = useRef<HTMLInputElement>(null);
	const [titleError, setTitleError] = useState<null | string>(null);
	const [widthError, setWidthError] = useState<null | string>(null);
	const [heightError, setHeightError] = useState<null | string>(null);
	const isChartWidget =
		newWidget.widgetType === 'line_chart' || newWidget.widgetType === 'bar_chart';
	const metricOptions = isChartWidget
		? METRIC_TYPE_OPTIONS.filter((opt) => TIME_SERIES_METRIC_VALUES.includes(opt.value))
		: METRIC_TYPE_OPTIONS;

	const handleWidgetTypeChange = (v: WidgetType) => {
		const willBeChart = v === 'line_chart' || v === 'bar_chart';
		const metricAllowed = willBeChart
			? TIME_SERIES_METRIC_VALUES.includes(newWidget.metricType)
			: true;
		// The height floor moves with the type — a chart needs more rows than a stat card. Raise a
		// height that has just fallen below the new floor rather than letting the user discover it
		// as a validation error on a field they never touched.
		const height = Math.max(newWidget.height, getWidgetMinRows(v));
		onUpdateWidget({
			...newWidget,
			height,
			metricType: metricAllowed ? newWidget.metricType : 'cpu_usage',
			widgetType: v,
		});
		if (!getWidgetHeightError(height, v)) setHeightError(null);
	};

	// Every field is marked at once so the user sees the full set of corrections, but focus
	// goes to the first invalid one in DOM order. Nothing is submitted while any check fails,
	// so an out-of-range size never reaches the API.
	const handleAddWidget = () => {
		if (isPending) return;
		const nextTitleError = newWidget.title.trim() ? null : 'Title is required';
		const nextWidthError = getWidgetWidthError(newWidget.width);
		const nextHeightError = getWidgetHeightError(newWidget.height, newWidget.widgetType);
		setTitleError(nextTitleError);
		setWidthError(nextWidthError);
		setHeightError(nextHeightError);
		if (nextTitleError) {
			titleInputRef.current?.focus();
			return;
		}
		if (nextWidthError) {
			widthInputRef.current?.focus();
			return;
		}
		if (nextHeightError) {
			heightInputRef.current?.focus();
			return;
		}
		onAddWidget();
	};

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			setTitleError(null);
			setWidthError(null);
			setHeightError(null);
		}
		onOpenChange(open);
	};

	return (
		<Dialog onOpenChange={handleOpenChange} open={isOpen}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Add Widget</DialogTitle>
					<DialogDescription>
						Configure a new widget for your dashboard.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4 py-4">
					<div className="space-y-2">
						<Label htmlFor="widget-title">Title</Label>
						<Input
							aria-describedby={titleError ? 'widget-title-error' : undefined}
							autoComplete="off"
							id="widget-title"
							onChange={(e) => {
								onUpdateWidget({ ...newWidget, title: e.target.value });
								if (e.target.value.trim()) {
									setTitleError(null);
								}
							}}
							placeholder="Widget title"
							ref={titleInputRef}
							required
							value={newWidget.title}
							{...(titleError ? { 'aria-invalid': true } : {})}
						/>
						{titleError && (
							<p
								aria-live="polite"
								className="text-sm text-destructive"
								id="widget-title-error">
								{titleError}
							</p>
						)}
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="widget-type">Widget Type</Label>
							<Select
								onValueChange={(v) => handleWidgetTypeChange(v as WidgetType)}
								value={newWidget.widgetType}>
								<SelectTrigger className="w-full" id="widget-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{WIDGET_TYPE_OPTIONS.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="widget-metric">Metric</Label>
							<Select
								onValueChange={(v) =>
									onUpdateWidget({
										...newWidget,
										metricType: v as MetricType,
									})
								}
								value={newWidget.metricType}>
								<SelectTrigger className="w-full" id="widget-metric">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{metricOptions.map((opt) => (
										<SelectItem key={opt.value} value={opt.value}>
											{opt.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
					<div className="grid grid-cols-3 gap-4">
						<WidgetSizeFields
							height={newWidget.height}
							heightError={heightError}
							heightRef={heightInputRef}
							onHeightChange={(height) => {
								onUpdateWidget({ ...newWidget, height });
								// Only ever clears, matching the title field: an error appears on
								// submit, not while the user is still typing a value.
								if (!getWidgetHeightError(height, newWidget.widgetType)) {
									setHeightError(null);
								}
							}}
							onWidthChange={(width) => {
								onUpdateWidget({ ...newWidget, width });
								if (!getWidgetWidthError(width)) setWidthError(null);
							}}
							widgetType={newWidget.widgetType}
							width={newWidget.width}
							widthError={widthError}
							widthRef={widthInputRef}
						/>
						<div className="space-y-2">
							<Label htmlFor="widget-time-range">Time Range</Label>
							<Select
								onValueChange={(v) =>
									onUpdateWidget({ ...newWidget, timeRange: v })
								}
								value={newWidget.timeRange ?? '6h'}>
								<SelectTrigger className="w-full" id="widget-time-range">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{TIME_RANGE_OPTIONS.map((opt) => (
										<SelectItem key={opt} value={opt}>
											{opt}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					</div>
				</div>
				<DialogFooter>
					<Button onClick={() => handleOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button disabled={isPending} onClick={handleAddWidget}>
						Add Widget
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
