import { Edit2 } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { DashboardHeaderFrame } from './DashboardHeaderFrame';

interface DashboardViewHeaderProps {
	backTo: string;
	canMutate: boolean;
	canShare: boolean;
	dashboardName: string;
	isSharePending: boolean;
	onEdit: () => void;
	onRename: () => void;
	onShare: () => void;
	widgetCount: number;
}

function DashboardViewHeader({
	backTo,
	canMutate,
	canShare,
	dashboardName,
	isSharePending,
	onEdit,
	onRename,
	onShare,
	widgetCount,
}: DashboardViewHeaderProps) {
	return (
		<DashboardHeaderFrame
			backTo={backTo}
			canMutate={canMutate}
			canShare={canShare}
			dashboardName={dashboardName}
			isSharePending={isSharePending}
			onRename={onRename}
			onShare={onShare}
			widgetCount={widgetCount}>
			{canMutate && (
				<Button onClick={onEdit} size="sm" variant="outline">
					<Edit2 aria-hidden className="mr-2 size-4" />
					Edit
				</Button>
			)}
		</DashboardHeaderFrame>
	);
}

export { DashboardViewHeader };
export type { DashboardViewHeaderProps };
