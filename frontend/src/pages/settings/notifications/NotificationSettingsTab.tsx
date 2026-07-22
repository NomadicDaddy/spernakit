import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { Setting } from '@/api/types';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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

const DEFAULT_PREF_TOGGLES: ToggleConfig[] = [
	{
		fallback: true,
		id: 'defaultEmail',
		key: 'app.notification_default_email',
		label: 'Email notifications enabled by default',
		toastLabel: 'Default email notifications',
	},
	{
		fallback: true,
		id: 'defaultPush',
		key: 'app.notification_default_push',
		label: 'Push notifications enabled by default',
		toastLabel: 'Default push notifications',
	},
	{
		fallback: true,
		id: 'defaultSecurity',
		key: 'app.notification_default_security',
		label: 'Security alerts enabled by default',
		toastLabel: 'Default security alerts',
	},
	{
		fallback: true,
		id: 'defaultSystem',
		key: 'app.notification_default_system',
		label: 'System alerts enabled by default',
		toastLabel: 'Default system alerts',
	},
	{
		fallback: false,
		id: 'defaultMarketing',
		key: 'app.notification_default_marketing',
		label: 'Marketing emails enabled by default',
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
			}
		);
	}

	return (
		<div className="space-y-6">
			{isAdmin() && (
				<Card>
					<CardHeader>
						<CardTitle>Broadcast Notification</CardTitle>
						<CardDescription>
							Send a notification to all users in the system
						</CardDescription>
					</CardHeader>
					<CardContent>
						<Button onClick={() => setShowBroadcast(true)} variant="outline">
							<Megaphone aria-hidden="true" className="mr-2 size-4" />
							Send Broadcast
						</Button>
					</CardContent>
				</Card>
			)}

			<Card>
				<CardHeader>
					<CardTitle>Notification Delivery</CardTitle>
					<CardDescription>
						Configure global notification delivery settings for all users
					</CardDescription>
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
						<div className="flex items-center justify-between">
							<div className="space-y-0.5">
								<Label>Deleted notifications</Label>
								<p className="text-muted-foreground text-xs">
									Soft-deleted notifications are permanently purged after this
									window. Read notifications are not auto-purged.
								</p>
							</div>
							<span className="text-muted-foreground text-sm">
								{retentionLoading
									? '…'
									: deletedNotificationsDays === undefined
										? 'Unavailable'
										: `${deletedNotificationsDays} ${
												deletedNotificationsDays === 1 ? 'day' : 'days'
											}`}
							</span>
						</div>
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
