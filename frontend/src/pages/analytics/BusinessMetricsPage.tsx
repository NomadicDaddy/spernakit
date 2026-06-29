import { useSearchParams } from 'react-router-dom';

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
import { UserActivitySection } from './UserActivitySection';

const VALID_DAYS = new Set([7, 30, 90, 365]);

export function BusinessMetricsPage() {
	const { can } = useAuthorization();
	const canView = can('OPERATOR');
	const canViewUserActivity = can('ADMIN');
	const [searchParams, setSearchParams] = useSearchParams();
	const daysParam = Number(searchParams.get('days'));
	const days = VALID_DAYS.has(daysParam) ? daysParam : 30;
	const setDays = (value: number) => {
		setSearchParams(
			(prev) => {
				if (value === 30) prev.delete('days');
				else prev.set('days', String(value));
				return prev;
			},
			{ replace: true }
		);
	};

	if (!canView) {
		return (
			<div className="flex h-[60vh] items-center justify-center">
				<div className="text-center">
					<h1 className="text-h1">Access Denied</h1>
					<p className="text-muted-foreground mt-2">
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
						<SelectItem value="7">Last 7 days</SelectItem>
						<SelectItem value="30">Last 30 days</SelectItem>
						<SelectItem value="90">Last 90 days</SelectItem>
						<SelectItem value="365">Last year</SelectItem>
					</SelectContent>
				</Select>
			</PageHeader>

			<DashboardStatsSection days={days} />
			<EventSummarySection days={days} />
			{canViewUserActivity && <UserActivitySection days={days} />}
		</div>
	);
}
