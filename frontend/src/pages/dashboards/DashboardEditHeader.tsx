import { Plus, Save, X } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { DashboardHeaderFrame } from './DashboardHeaderFrame';

interface DashboardEditHeaderProps {
	backTo: string;
	canMutate: boolean;
	canShare: boolean;
	dashboardName: string;
	isSavePending: boolean;
	isSharePending: boolean;
	onAddWidget: () => void;
	onCancel: () => void;
	onRename: () => void;
	onSave: () => void;
	onShare: () => void;
	widgetCount: number;
}

function DashboardEditHeader({
	backTo,
	canMutate,
	canShare,
	dashboardName,
	isSavePending,
	isSharePending,
	onAddWidget,
	onCancel,
	onRename,
	onSave,
	onShare,
	widgetCount,
}: DashboardEditHeaderProps) {
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
				<>
					<Button onClick={onAddWidget} size="sm" variant="outline">
						<Plus aria-hidden className="mr-2 size-4" />
						Add Widget
					</Button>
					<Button disabled={isSavePending} onClick={onSave} size="sm">
						<Save aria-hidden className="mr-2 size-4" />
						Save
					</Button>
					<Button onClick={onCancel} size="sm" variant="ghost">
						<X aria-hidden className="mr-2 size-4" />
						Cancel
					</Button>
				</>
			)}
		</DashboardHeaderFrame>
	);
}

export { DashboardEditHeader };
export type { DashboardEditHeaderProps };
