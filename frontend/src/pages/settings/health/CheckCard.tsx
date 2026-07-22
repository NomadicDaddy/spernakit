import type { HealthCheck } from '@/api/health';

import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

import { statusBadgeClassName, statusIcon } from './healthStatusUtils';

interface CheckCardProps {
	check: HealthCheck;
}

export function CheckCard({ check }: CheckCardProps) {
	return (
		<Card>
			<CardContent className="flex items-center justify-between p-4">
				<div className="flex items-center gap-3">
					{statusIcon(check.status)}
					<div>
						<p className="text-sm font-medium capitalize">{check.checkType}</p>
						<p className="text-muted-foreground text-xs">{check.durationMs}ms</p>
					</div>
				</div>
				<Badge className={statusBadgeClassName(check.status)}>{check.status}</Badge>
			</CardContent>
		</Card>
	);
}
