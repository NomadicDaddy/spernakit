import { AlertCircle, Info, Megaphone, Shield, ShieldAlert, Sparkles } from 'lucide-react';

import type { NotificationStatistics } from '@/api/types';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface StatCard {
	color: string;
	getValue: (stats: NotificationStatistics) => number;
	icon: typeof Info;
	label: string;
}

const STAT_CARDS: StatCard[] = [
	{ color: 'text-blue-500', getValue: (s) => s.total, icon: Info, label: 'Total' },
	{ color: 'text-amber-500', getValue: (s) => s.unread, icon: AlertCircle, label: 'Unread' },
	{ color: 'text-sky-500', getValue: (s) => s.byType.info ?? 0, icon: Info, label: 'Info' },
	{
		color: 'text-orange-500',
		getValue: (s) => s.byType.warning ?? 0,
		icon: ShieldAlert,
		label: 'Warning',
	},
	{
		color: 'text-red-500',
		getValue: (s) => s.byType.error ?? 0,
		icon: AlertCircle,
		label: 'Error',
	},
	{
		color: 'text-green-500',
		getValue: (s) => s.byType.success ?? 0,
		icon: Sparkles,
		label: 'Success',
	},
	{
		color: 'text-purple-500',
		getValue: (s) => s.byType.security ?? 0,
		icon: Shield,
		label: 'Security',
	},
	{
		color: 'text-pink-500',
		getValue: (s) => s.byType.marketing ?? 0,
		icon: Megaphone,
		label: 'Marketing',
	},
];

function NotificationStatsGrid({ stats }: { stats: NotificationStatistics | undefined }) {
	if (stats) {
		return (
			<div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
				{STAT_CARDS.map(({ color, getValue, icon: Icon, label }) => (
					<Card key={label}>
						<CardContent className="flex items-center gap-3 p-4">
							<Icon aria-hidden="true" className={`size-5 shrink-0 ${color}`} />
							<div className="min-w-0">
								<p className="text-muted-foreground text-xs">{label}</p>
								<p className="text-lg font-semibold tabular-nums">
									{getValue(stats)}
								</p>
							</div>
						</CardContent>
					</Card>
				))}
			</div>
		);
	}

	return (
		<div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
			{STAT_CARDS.map(({ label }) => (
				<Skeleton className="h-[72px] w-full" key={label} />
			))}
		</div>
	);
}

export { NotificationStatsGrid };
