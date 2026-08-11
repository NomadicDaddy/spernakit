import { LayoutGrid } from 'lucide-react';
import { lazy, Suspense } from 'react';

import type { DashboardWidget } from '@/api/dashboards';

import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

import { AlertListWidget, GaugeWidget, HealthStatusWidget, StatCardWidget } from './widgets';
import { WidgetFrame } from './widgets/WidgetFrame';
import { WidgetSkeleton } from './widgets/WidgetSkeleton';

const LineChartWidget = lazy(() =>
	import('./widgets/LineChartWidget').then((m) => ({ default: m.LineChartWidget })),
);
const BarChartWidget = lazy(() =>
	import('./widgets/BarChartWidget').then((m) => ({ default: m.BarChartWidget })),
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

/**
 * Which interior density a widget type gets.
 *
 * Two named steps, not an ad-hoc `p-3` for everything. `roomy` is the app's standard 24px card
 * interior and goes to the widget types whose row floor is 3 (240px) — a chart or list has the
 * height to spend it, and at 24px a Line Chart widget reads at the same density as the charts on
 * /dashboard. `compact` keeps the 12px step for the single-value types, whose row floor is 2
 * (160px) and whose whole content is a title line plus a `text-2xl` value; `WIDGET_MIN_ROWS` in
 * `widgetSize.ts` derives that floor from 24px of vertical padding, so widening it there would
 * push the value back below the card edge that floor exists to prevent.
 */
const ROOMY_WIDGET_TYPES = new Set(['alert_list', 'bar_chart', 'line_chart', 'table']);

function DashboardWidgetRenderer({
	allowPrivateData = true,
	widget,
}: DashboardWidgetRendererProps) {
	const isRoomy = ROOMY_WIDGET_TYPES.has(widget.widgetType);

	return (
		/*
		 * No `overflow-hidden` here. It used to guarantee the card's silhouette, but what it
		 * actually did at the shortest row heights was slice the bottom off the number the widget
		 * exists to show. The widgets now absorb a shortfall themselves — `WidgetFrame` centres the
		 * value in whatever height is left — and `WIDGET_MIN_ROWS` stops a widget being sized below
		 * its content in the first place, so there is nothing left for a clip to hide.
		 */
		<Card className={cn('h-full gap-0', isRoomy ? 'py-6' : 'py-3')}>
			<CardContent className={cn('h-full min-h-0', isRoomy ? 'px-6' : 'px-3')}>
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
			/*
			 * An unrenderable widget is still one of the user's widgets. The old fallback dropped
			 * the title and centred the developer-facing string "Unknown widget type" in an
			 * otherwise blank card, so a `table` widget — a type the backend accepts and stores but
			 * this renderer has no case for — appeared on a shared dashboard as an anonymous empty
			 * box among labelled ones, and a reader had no way to tell it apart from a widget that
			 * had failed to load. Keeping `WidgetFrame` keeps the title in the same position every
			 * other widget puts it, and `EmptyState` is the shape this app already uses for "there
			 * is deliberately nothing here". Its padding is cut to `py-4`: the compact variant is
			 * tuned for a page section, and at `py-8` the tile plus copy overruns the 160px floor an
			 * unrecognised type is allowed.
			 */
			return (
				<WidgetFrame title={widget.title}>
					<EmptyState
						className="h-full border-0 bg-transparent px-2 py-4"
						description="This widget type isn't available in this view."
						icon={LayoutGrid}
						title="Can't display this widget"
						variant="compact"
					/>
				</WidgetFrame>
			);
	}
}

export { DashboardWidgetRenderer };
