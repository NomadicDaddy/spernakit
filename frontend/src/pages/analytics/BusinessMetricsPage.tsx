import { useSearchParams } from 'react-router';

import { PageHeader } from '@/components/shared/PageHeader';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { useAuthorization } from '@/hooks/useAuthorization';

import { DashboardStatsSection } from './DashboardStatsSection';
import { EventSummarySection } from './EventSummarySection';
import { ANALYTICS_RANGES, DEFAULT_ANALYTICS_DAYS } from './timeRange';
import { UserActivitySection } from './UserActivitySection';

const VALID_DAYS = new Set(ANALYTICS_RANGES.map((r) => r.days));

export function BusinessMetricsPage() {
	const { can } = useAuthorization();
	const canView = can('OPERATOR');
	const canViewUserActivity = can('ADMIN');
	const [searchParams, setSearchParams] = useSearchParams();
	const daysParam = Number(searchParams.get('days'));
	const days = VALID_DAYS.has(daysParam) ? daysParam : DEFAULT_ANALYTICS_DAYS;
	const setDays = (value: number) => {
		setSearchParams(
			(prev) => {
				if (value === DEFAULT_ANALYTICS_DAYS) prev.delete('days');
				else prev.set('days', String(value));
				return prev;
			},
			{ replace: true },
		);
	};

	if (!canView) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<div className="text-center">
					<h1 className="text-h1">Access Denied</h1>
					<p className="mt-2 text-muted-foreground">
						You need OPERATOR role or higher to view business metrics.
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6 p-6">
			<PageHeader description="Business metrics and insights" title="Analytics">
				<Select onValueChange={(value) => setDays(Number(value))} value={String(days)}>
					<SelectTrigger aria-label="Select time range" className="w-[160px]">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{ANALYTICS_RANGES.map((range) => (
							<SelectItem key={range.days} value={String(range.days)}>
								{range.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</PageHeader>

			<DashboardStatsSection days={days} />
			<EventSummarySection days={days} />
			{canViewUserActivity && <UserActivitySection days={days} />}
		</div>
	);
}
