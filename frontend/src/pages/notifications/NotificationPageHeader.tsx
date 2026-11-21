import { CheckCheck } from 'lucide-react';

import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/button';

/** The Notifications page header: the title, its description and the Mark all read action. */
export function NotificationPageHeader({
	markAllReadIsPending,
	onMarkAllRead,
	statsLoading,
	unreadCount,
}: {
	markAllReadIsPending: boolean;
	onMarkAllRead: () => void;
	statsLoading: boolean;
	unreadCount: number;
}) {
	return (
		/*
		 * The description no longer prints a count. It said "N total notifications" directly above a
		 * Total tile saying the same thing, and the table's own pagination summary states the
		 * filtered count — three renderings of one number down the same column.
		 */
		<PageHeader description="Alerts and messages for your workspace" title="Notifications">
			{/*
			 * Hidden rather than permanently disabled. With nothing unread this rendered as a greyed
			 * control in the page's most prominent action slot, and the only explanation — "There
			 * are no unread notifications." — lived in an sr-only span. A `title` would not have
			 * fixed that: the Button sets `disabled:pointer-events-none`, so a native tooltip never
			 * fires on it. An action that cannot apply is better absent than dead, and the Unread
			 * tile beside it already says why.
			 */}
			{(statsLoading || unreadCount > 0) && (
				<Button
					disabled={statsLoading || markAllReadIsPending}
					onClick={onMarkAllRead}
					size="sm"
					variant="outline">
					<CheckCheck aria-hidden="true" className="size-4" />
					Mark all read
				</Button>
			)}
			{/*
			 * Delete no longer lives here. In the header it sat two sections above the checkboxes it
			 * acted on — off screen once the stats grid and the toolbar were between them — and it
			 * reported a bare count, so a filter that hid every selected row left "Delete (1)" in the
			 * page's most prominent action slot pointing at nothing visible. It is now in the shared
			 * BulkActionBar under the table, beside its selection and beside the count of what the
			 * filter is hiding, the same as /settings/users.
			 */}
		</PageHeader>
	);
}
