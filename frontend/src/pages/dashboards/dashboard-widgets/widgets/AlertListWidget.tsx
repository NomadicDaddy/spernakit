import { AlertTriangle } from 'lucide-react';

import type { DashboardWidget } from '@/api/dashboards';

export function AlertListWidget({ widget }: { widget: DashboardWidget }) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between pb-1">
				<span className="text-xs font-medium text-muted-foreground">{widget.title}</span>
				<AlertTriangle aria-hidden="true" className="size-4 text-muted-foreground" />
			</div>
			<div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
				No active alerts
			</div>
		</div>
	);
}
