import { AlertTriangle } from 'lucide-react';

import type { DashboardWidget } from '@/api/dashboards';

export function AlertListWidget({ widget }: { widget: DashboardWidget }) {
	return (
		<div className="flex h-full flex-col">
			<div className="flex items-center justify-between pb-1">
				<span className="text-muted-foreground text-xs font-medium">{widget.title}</span>
				<AlertTriangle aria-hidden="true" className="text-muted-foreground size-4" />
			</div>
			<div className="text-muted-foreground flex flex-1 items-center justify-center text-sm">
				No active alerts
			</div>
		</div>
	);
}
