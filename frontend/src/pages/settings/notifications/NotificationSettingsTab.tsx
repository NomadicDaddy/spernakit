import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { Setting } from '@/api/types';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useNotificationRetentionPolicy } from '@/hooks/notifications/useNotifications';
import { useSaveSetting, useSettings } from '@/hooks/settings/useSettingsHooks';
import { useAuthorization } from '@/hooks/useAuthorization';

import { SettingsToggleRow } from '../SettingsToggleRow';
import { BroadcastDialog } from './BroadcastDialog';

interface ToggleConfig {
	description?: string;
	fallback: boolean;
	id: string;
	key: string;
	label: string;
	toastLabel: string;
}

const DELIVERY_TOGGLES: ToggleConfig[] = [
	{
		description: 'Allow sending notification emails to users',
		fallback: true,
		id: 'emailEnabled',
		key: 'app.notification_email_enabled',
		label: 'Email notifications',
		toastLabel: 'Email notifications',
	},
	{
		description: 'Allow real-time push notifications via WebSocket',
		fallback: true,
		id: 'pushEnabled',
		key: 'app.notification_push_enabled',
		label: 'Push notifications',
		toastLabel: 'Push notifications',
	},
	{
		description: 'Send alerts for system events (health, tasks, errors)',
		fallback: true,
		id: 'alertsEnabled',
		key: 'app.notification_alerts_enabled',
		label: 'System alerts',
		toastLabel: 'System alerts',
	},
];

/*
 * Labels match /profile/preferences one-to-one so an operator can read the global default and the
 * per-user control by the same name. The "enabled by default" suffix the labels used to carry is
 * already stated by the card title and description; repeating it five times cost each row 20
 * characters and left no room for the description slot, so these rows scanned at a 34px pitch
 * against the 48px pitch of the card directly above them.
 */
const DEFAULT_PREF_TOGGLES: ToggleConfig[] = [
	{
		fallback: true,
		id: 'defaultEmail',
		key: 'app.notification_default_email',
		label: 'Email notifications',
		toastLabel: 'Default email notifications',
	},
	{
		fallback: true,
		id: 'defaultPush',
		key: 'app.notification_default_push',
		label: 'Push notifications',
		toastLabel: 'Default push notifications',
	},
	{
		fallback: true,
		id: 'defaultSecurity',
		key: 'app.notification_default_security',
		label: 'Security alerts',
		toastLabel: 'Default security alerts',
	},
	{
		fallback: true,
		id: 'defaultSystem',
		key: 'app.notification_default_system',
		label: 'System alerts',
		toastLabel: 'Default system alerts',
	},
	{
		fallback: false,
		id: 'defaultMarketing',
		key: 'app.notification_default_marketing',
		label: 'Marketing emails',
		toastLabel: 'Default marketing emails',
	},
];

function parseBool(settingsMap: Map<string, Setting>, key: string, fallback: boolean): boolean {
	const raw = settingsMap.get(key)?.value;
	if (raw === undefined) return fallback;
	return String(raw) === 'true';
}

function NotificationSettingsTab() {
	const { isAdmin } = useAuthorization();
	const [showBroadcast, setShowBroadcast] = useState(false);
	const { data, isLoading } = useSettings();
	const saveSetting = useSaveSetting();
	const { data: retentionData, isLoading: retentionLoading } =
		useNotificationRetentionPolicy(isAdmin());

	const deletedNotificationsDays = retentionData?.data.deletedNotificationsDays;

	const [optimistic, setOptimistic] = useState<Record<string, boolean | null>>({});

	const allSettings = data?.data ?? [];
	const settingsMap = new Map(allSettings.map((s) => [s.key, s]));

	function resolve(key: string, fallback: boolean): boolean {
		return optimistic[key] ?? parseBool(settingsMap, key, fallback);
	}

	function toggle(key: string, checked: boolean, label: string) {
		setOptimistic((prev) => ({ ...prev, [key]: checked }));
		saveSetting.mutate(
			{ key, value: JSON.stringify(checked) },
			{
				onError: () => {
					setOptimistic((prev) => ({ ...prev, [key]: null }));
				},
				onSuccess: () => {
					toast.success(`${label} updated`);
					setOptimistic((prev) => ({ ...prev, [key]: null }));
				},
			},
		);
	}

	return (
		<div className="space-y-6">
			{/*
			 * The broadcast action used to own the top card — a 152px shell holding one button,
			 * whose title and description repeated the dialog's own header word for word. In the
			 * delivery card's action slot it costs no vertical space and the page opens on real
			 * settings.
			 */}
			<Card>
				<CardHeader>
					<CardTitle>Notification Delivery</CardTitle>
					<CardDescription>
						Configure global notification delivery settings for all users
					</CardDescription>
					{isAdmin() && (
						<CardAction>
							<Button onClick={() => setShowBroadcast(true)} variant="outline">
								<Megaphone aria-hidden="true" className="size-4" />
								Send Broadcast
							</Button>
						</CardAction>
					)}
				</CardHeader>
				{/* `max-w-2xl` on the stack, the cap the authentication sections apply at this same
				    level. See SettingsToggleRow. */}
				<CardContent className="max-w-2xl">
					<div className="space-y-3">
						{DELIVERY_TOGGLES.map((t) => (
							<SettingsToggleRow
								checked={resolve(t.key, t.fallback)}
								{...(t.description !== undefined && {
									description: t.description,
								})}
								disabled={isLoading || saveSetting.isPending}
								id={t.id}
								key={t.id}
								label={t.label}
								onCheckedChange={(checked) => toggle(t.key, checked, t.toastLabel)}
							/>
						))}
					</div>
				</CardContent>
			</Card>

			{isAdmin() && (
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
							{/*
							 * Term and value on one line, the explanation on the next. The row used to
							 * be `justify-between` inside a full-width card, which put "Deleted
							 * notifications" at the left edge and the "30 days" that answers it 746px
							 * away at 2560 — one fact, split across the whole card. RuntimeConfigTab's
							 * field list gets away with the same split because its cards sit in a
							 * two-column grid and its rows are ~564px; the `max-w-2xl` on CardContent
							 * now gives this one a comparable ceiling, and the wrap keeps the pair
							 * together at any width below it.
							 *
							 * `w-full` on the explanation is what breaks the line: the group is a
							 * `flex-wrap` row, so the description claims a row of its own beneath the
							 * pair rather than competing with it. Kept as a flat `dt`/`dd`/`dd` group
							 * because `dl > div` may only hold `dt` and `dd` children.
							 */}
							<div className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2 first:pt-0 last:pb-0">
								<dt className="text-sm text-muted-foreground">
									Deleted notifications
								</dt>
								<dd className="shrink-0">
									<Badge variant="outline">
										{retentionLoading
											? '…'
											: deletedNotificationsDays === undefined
												? 'Unavailable'
												: `${deletedNotificationsDays} ${
														deletedNotificationsDays === 1
															? 'day'
															: 'days'
													}`}
									</Badge>
								</dd>
								<dd className="w-full text-xs text-muted-foreground">
									Soft-deleted notifications are permanently purged after this
									window. Read notifications are not auto-purged.
								</dd>
							</div>
						</dl>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Default Preferences</CardTitle>
					<CardDescription>
						Default notification preferences for new users. Individual users can
						override these in their profile settings.
					</CardDescription>
				</CardHeader>
				{/* Same stack cap as the delivery card above. See SettingsToggleRow. */}
				<CardContent className="max-w-2xl">
					<div className="space-y-3">
						{DEFAULT_PREF_TOGGLES.map((t) => (
							<SettingsToggleRow
								checked={resolve(t.key, t.fallback)}
								description={`${t.fallback ? 'On' : 'Off'} for new users unless they change it.`}
								disabled={isLoading || saveSetting.isPending}
								id={t.id}
								key={t.id}
								label={t.label}
								onCheckedChange={(checked) => toggle(t.key, checked, t.toastLabel)}
							/>
						))}
					</div>
				</CardContent>
			</Card>

			<BroadcastDialog isOpen={showBroadcast} onOpenChange={setShowBroadcast} />
		</div>
	);
}

export { NotificationSettingsTab };
