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
		onUpdateWidget({
			...newWidget,
			metricType: metricAllowed ? newWidget.metricType : 'cpu_usage',
			widgetType: v,
		});
	};

	return (
		<Dialog onOpenChange={onOpenChange} open={isOpen}>
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
							autoComplete="off"
							id="widget-title"
							onChange={(e) =>
								onUpdateWidget({ ...newWidget, title: e.target.value })
							}
							placeholder="Widget title"
							value={newWidget.title}
						/>
					</div>
					<div className="grid grid-cols-2 gap-4">
						<div className="space-y-2">
							<Label htmlFor="widget-type">Widget Type</Label>
							<Select
								onValueChange={(v) => handleWidgetTypeChange(v as WidgetType)}
								value={newWidget.widgetType}>
								<SelectTrigger id="widget-type">
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
								<SelectTrigger id="widget-metric">
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
						<div className="space-y-2">
							<Label htmlFor="widget-width">Width (cols)</Label>
							<Input
								autoComplete="off"
								id="widget-width"
								inputMode="numeric"
								max={12}
								min={1}
								onChange={(e) =>
									onUpdateWidget({
										...newWidget,
										width: Number(e.target.value),
									})
								}
								type="number"
								value={newWidget.width}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="widget-height">Height (rows)</Label>
							<Input
								autoComplete="off"
								id="widget-height"
								inputMode="numeric"
								min={1}
								onChange={(e) =>
									onUpdateWidget({
										...newWidget,
										height: Number(e.target.value),
									})
								}
								type="number"
								value={newWidget.height}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="widget-time-range">Time Range</Label>
							<Select
								onValueChange={(v) =>
									onUpdateWidget({ ...newWidget, timeRange: v })
								}
								value={newWidget.timeRange ?? '6h'}>
								<SelectTrigger id="widget-time-range">
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
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancel
					</Button>
					<Button disabled={!newWidget.title.trim() || isPending} onClick={onAddWidget}>
						Add Widget
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
