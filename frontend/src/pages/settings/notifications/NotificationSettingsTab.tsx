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
				<CardContent>
					<div className="space-y-4">
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
							How long notifications are kept before automated cleanup. This reflects
							the active server retention configuration and is read-only.
						</CardDescription>
					</CardHeader>
					<CardContent>
						{/*
						 * Reported server config, rendered in the read-only idiom RuntimeConfigTab
						 * uses for exactly this content: a `divide-y` field list with a muted label
						 * and a Badge holding the value. Built from the editable toggle row's shape
						 * — bold Label, right-aligned slot — the only thing marking it as not a
						 * control was the missing switch.
						 */}
						<dl className="divide-y divide-border/40">
							<div className="flex items-start justify-between gap-6 py-2 first:pt-0 last:pb-0">
								<div className="space-y-0.5">
									<dt className="text-sm text-muted-foreground">
										Deleted notifications
									</dt>
									<dd className="text-xs text-muted-foreground">
										Soft-deleted notifications are permanently purged after this
										window. Read notifications are not auto-purged.
									</dd>
								</div>
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
				<CardContent>
					<div className="space-y-4">
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
