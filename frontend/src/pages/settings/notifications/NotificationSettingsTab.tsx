import { Megaphone } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import type { Setting } from '@/api/types';

import { Button } from '@/components/ui/button';
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from '@/components/ui/card';
import { useSaveSetting, useSettings } from '@/hooks/settings/useSettingsHooks';
import { useAuthorization } from '@/hooks/useAuthorization';

import { SettingsToggleRow } from '../SettingsToggleRow';
import { BroadcastDialog } from './BroadcastDialog';
import { NotificationRetentionCard } from './NotificationRetentionCard';
import { DEFAULT_PREF_TOGGLES, DELIVERY_TOGGLES } from './notificationToggles';

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

			{isAdmin() && <NotificationRetentionCard />}

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
