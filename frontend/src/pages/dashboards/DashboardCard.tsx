import { Download, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import type { DashboardConfig } from '@/api/dashboards';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useFormatters } from '@/hooks/useFormatters';
import { preloadDashboardRoute } from '@/routes/preload';

interface DashboardCardProps {
	canMutate: boolean;
	dashboard: DashboardConfig;
	onDelete: (id: number) => void;
	onExport: (id: number) => Promise<void>;
}

/**
 * Dashboard card component.
 */
export function DashboardCard({ canMutate, dashboard, onDelete, onExport }: DashboardCardProps) {
	const { formatDate } = useFormatters();
	return (
		<Card
			className="relative transition-shadow hover:shadow-md"
			onFocus={preloadDashboardRoute}
			onMouseEnter={preloadDashboardRoute}>
			<CardHeader>
				<div className="flex items-start justify-between">
					<div>
						<CardTitle className="text-base">
							<Link
								className="after:absolute after:inset-0"
								to={`/dashboards/${dashboard.id}`}>
								{dashboard.name}
							</Link>
						</CardTitle>
						<CardDescription>Created {formatDate(dashboard.createdAt)}</CardDescription>
					</div>
					<div className="relative z-10 flex gap-1">
						<Button
							aria-label="Export dashboard"
							onClick={() => {
								void onExport(dashboard.id);
							}}
							size="icon"
							variant="ghost">
							<Download className="size-4" />
						</Button>
						{canMutate && (
							<Button
								aria-label="Delete dashboard"
								onClick={() => onDelete(dashboard.id)}
								size="icon"
								variant="ghost">
								<Trash2 className="size-4" />
							</Button>
						)}
					</div>
				</div>
			</CardHeader>
		</Card>
	);
}
