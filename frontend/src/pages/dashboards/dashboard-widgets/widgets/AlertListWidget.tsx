import { AlertTriangle } from 'lucide-react';

import type { DashboardWidget } from '@/api/dashboards';

import { WidgetFrame } from './WidgetFrame';

export function AlertListWidget({ widget }: { widget: DashboardWidget }) {
	return (
		<WidgetFrame
			icon={<AlertTriangle aria-hidden="true" className="size-4 text-muted-foreground" />}
			title={widget.title}>
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				No active alerts
			</div>
		</WidgetFrame>
	);
}
