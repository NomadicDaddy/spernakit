import { Badge } from '@/components/ui/badge';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useNotificationRetentionPolicy } from '@/hooks/notifications/useNotifications';

/**
 * Term and value on one line, the explanation on the next. The row used to be `justify-between`
 * inside a full-width card, which put "Deleted notifications" at the left edge and the "30 days"
 * that answers it 746px away at 2560 — one fact, split across the whole card. RuntimeConfigTab's
 * field list gets away with the same split because its cards sit in a two-column grid and its rows
 * are ~564px; the `max-w-2xl` on CardContent now gives this one a comparable ceiling, and the wrap
 * keeps the pair together at any width below it.
 *
 * `w-full` on the explanation is what breaks the line: the group is a `flex-wrap` row, so the
 * description claims a row of its own beneath the pair rather than competing with it. Kept as a
 * flat `dt`/`dd`/`dd` group because `dl > div` may only hold `dt` and `dd` children.
 */
function DeletedNotificationsRow({
	days,
	loading,
}: {
	days: number | undefined;
	loading: boolean;
}) {
	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
			<dt className="text-sm text-muted-foreground">Deleted notifications</dt>
			<dd className="shrink-0">
				<Badge variant="outline">
					{loading
						? '…'
						: days === undefined
							? 'Unavailable'
							: `${days} ${days === 1 ? 'day' : 'days'}`}
				</Badge>
			</dd>
			<dd className="w-full text-xs text-muted-foreground">
				Soft-deleted notifications are permanently purged after this window. Read
				notifications are not auto-purged.
			</dd>
		</div>
	);
}

/**
 * The read-only Notification Retention card. The settings tab mounts it only for admins, so the
 * retention policy is fetched in exactly the cases it was before, when the tab passed isAdmin()
 * as the query's enabled flag.
 */
export function NotificationRetentionCard() {
	const { data: retentionData, isLoading: retentionLoading } = useNotificationRetentionPolicy();
	const deletedNotificationsDays = retentionData?.data.deletedNotificationsDays;

	return (
		<Card>
			<CardHeader>
				<CardTitle>Notification Retention</CardTitle>
				<CardDescription>
					How long notifications are kept before automated cleanup.
				</CardDescription>
				{/*
				 * "Read-only" on the title line, where this surface's other card-level
				 * affordance already lives.
				 *
				 * This card's shell is identical to the two editable cards around it —
				 * same border, shadow, title weight and right-aligned value slot — and its
				 * "30 days" pill sits exactly where those cards put their switches, so it
				 * read as an interactive chip. The only cue that it is not was the phrase
				 * "and is read-only" at the tail of the second line of a muted
				 * description. The Delivery card puts its Send Broadcast button in
				 * CardAction, so the eye is already trained to look there for what a card
				 * lets you do; `outline` because this is metadata about the card, not a
				 * state of the thing it describes.
				 */}
				<CardAction>
					<Badge variant="outline">Read-only</Badge>
				</CardAction>
			</CardHeader>
			{/* The same stack cap as the two toggle cards around it — this card's content is
					    one column of the same kind, and the three now share a right edge. */}
			<CardContent className="max-w-2xl">
				{/*
				 * Reported server config, rendered in the read-only idiom RuntimeConfigTab
				 * uses for exactly this content: a `divide-y` field list with a muted label
				 * and a Badge holding the value. Built from the editable toggle row's shape
				 * — bold Label, right-aligned slot — the only thing marking it as not a
				 * control was the missing switch.
				 */}
				<dl className="divide-y divide-border/40">
					<DeletedNotificationsRow
						days={deletedNotificationsDays}
						loading={retentionLoading}
					/>
				</dl>
			</CardContent>
		</Card>
	);
}
