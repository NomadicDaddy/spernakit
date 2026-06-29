import type { ReactNode } from 'react';

import { ArrowLeft, Pencil, Share2 } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';

interface DashboardHeaderFrameProps {
	backTo: string;
	canMutate: boolean;
	canShare: boolean;
	children?: ReactNode;
	dashboardName: string;
	isSharePending: boolean;
	onRename: () => void;
	onShare: () => void;
	widgetCount: number;
}

function DashboardHeaderFrame({
	backTo,
	canMutate,
	canShare,
	children,
	dashboardName,
	isSharePending,
	onRename,
	onShare,
	widgetCount,
}: DashboardHeaderFrameProps) {
	return (
		<div className="flex items-center justify-between">
			<div className="flex items-center gap-3">
				<Button aria-label="Go back" asChild size="icon" variant="ghost">
					<Link to={backTo}>
						<ArrowLeft className="size-4" />
					</Link>
				</Button>
				<div>
					<div className="flex items-center gap-2">
						<h1 className="text-h1">{dashboardName}</h1>
						{canMutate && (
							<Button
								aria-label="Rename dashboard"
								onClick={onRename}
								size="icon"
								variant="ghost">
								<Pencil className="size-3.5" />
							</Button>
						)}
					</div>
					<p className="text-muted-foreground text-sm">
						{widgetCount} widget{widgetCount !== 1 ? 's' : ''}
					</p>
				</div>
			</div>
			<div className="flex gap-2">
				{canShare && (
					<Button disabled={isSharePending} onClick={onShare} size="sm" variant="outline">
						<Share2 aria-hidden className="mr-2 size-4" />
						Share
					</Button>
				)}
				{children}
			</div>
		</div>
	);
}

export { DashboardHeaderFrame };
