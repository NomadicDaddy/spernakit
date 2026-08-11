import type { ReactNode } from 'react';

import { Pencil, Share2 } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';

interface DashboardHeaderFrameProps {
	/** Label for the first breadcrumb — the list this dashboard was opened from. */
	backLabel?: string;
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

/**
 * Header shell shared by the view and edit modes of a custom dashboard.
 *
 * Built on `PageHeader` rather than hand-rolled. The bespoke version was a `flex items-center
 * justify-between` with an unlabelled back arrow, an inline `h1`, a pencil button wedged beside
 * the heading and a plain `<p>` subtitle — so this page had no breadcrumb trail (the only way
 * back was a bare glyph) and none of the eyebrow/description structure every other page carries.
 * It also had no `flex-wrap` and no `min-w-0`, so in edit mode below 1280 the five action buttons
 * crowded into the second line of a wrapped title. `PageHeader` already solves both: the trail is
 * a real `nav[aria-label="Breadcrumb"]`, and the action cluster drops to its own row under `md`.
 */
function DashboardHeaderFrame({
	backLabel = 'Custom Dashboards',
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
		<PageHeader
			breadcrumbs={[{ label: backLabel, to: backTo }, { label: dashboardName }]}
			description={`${widgetCount} widget${widgetCount !== 1 ? 's' : ''}`}
			title={dashboardName}>
			{/*
			 * Rename joins the action cluster with a visible label instead of sitting inside the
			 * heading as a 14px pencil. A control nested in an `h1` is read as part of the
			 * heading, and at icon size it was the smallest target on the page.
			 */}
			{canMutate && (
				<Button onClick={onRename} size="sm" variant="ghost">
					<Pencil aria-hidden className="size-4" />
					Rename
				</Button>
			)}
			{canShare && (
				<Button disabled={isSharePending} onClick={onShare} size="sm" variant="outline">
					<Share2 aria-hidden className="size-4" />
					Share
				</Button>
			)}
			{children}
		</PageHeader>
	);
}

export { DashboardHeaderFrame };
