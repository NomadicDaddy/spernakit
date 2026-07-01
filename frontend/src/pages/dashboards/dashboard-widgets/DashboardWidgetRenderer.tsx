import { Suspense, lazy } from 'react';

import type { DashboardWidget } from '@/api/dashboards';

import { Card, CardContent } from '@/components/ui/card';

import { METRIC_ICON } from './widgetHelpers';
import { AlertListWidget, GaugeWidget, HealthStatusWidget, StatCardWidget } from './widgets';
import { WidgetSkeleton } from './widgets/WidgetSkeleton';

const LineChartWidget = lazy(() =>
	import('./widgets/LineChartWidget').then((m) => ({ default: m.LineChartWidget }))
);
const BarChartWidget = lazy(() =>
	import('./widgets/BarChartWidget').then((m) => ({ default: m.BarChartWidget }))
);

/**
 * Renders a dashboard widget inside a Card, dispatching to correct
 * visualisation component (stat card, gauge, line/bar chart, etc.) based
 * on widget's `widgetType`.
 */
interface DashboardWidgetRendererProps {
	allowPrivateData?: boolean;
	widget: DashboardWidget;
}

interface WidgetContentProps {
	allowPrivateData: boolean;
	widget: DashboardWidget;
}

function DashboardWidgetRenderer({
	allowPrivateData = true,
	widget,
}: DashboardWidgetRendererProps) {
	return (
		<Card className="h-full overflow-hidden">
			<CardContent className="h-full p-3">
				<WidgetContent allowPrivateData={allowPrivateData} widget={widget} />
			</CardContent>
		</Card>
	);
}

function WidgetContent({ allowPrivateData, widget }: WidgetContentProps) {
	switch (widget.widgetType) {
		case 'alert_list':
			return <AlertListWidget widget={widget} />;
		case 'bar_chart':
			return (
				<Suspense fallback={<WidgetSkeleton />}>
					<BarChartWidget allowPrivateData={allowPrivateData} widget={widget} />
				</Suspense>
			);
		case 'gauge':
			return <GaugeWidget allowPrivateData={allowPrivateData} widget={widget} />;
		case 'health_status':
			return <HealthStatusWidget allowPrivateData={allowPrivateData} widget={widget} />;
		case 'line_chart':
			return (
				<Suspense fallback={<WidgetSkeleton />}>
					<LineChartWidget allowPrivateData={allowPrivateData} widget={widget} />
				</Suspense>
			);
		case 'stat_card':
			return <StatCardWidget allowPrivateData={allowPrivateData} widget={widget} />;
		default:
			return (
				<div className="text-muted-foreground flex h-full items-center justify-center text-sm">
					Unknown widget type
				</div>
			);
	}
}

export { DashboardWidgetRenderer, METRIC_ICON };
