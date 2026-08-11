import type { NotificationPreferences as NotificationPrefs } from '@/api/notifications';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

const preferenceItems: {
	description: string;
	key: keyof NotificationPrefs;
	label: string;
}[] = [
	{
		description: 'Receive email notifications for important events',
		key: 'emailNotifications',
		label: 'Email notifications',
	},
	{
		description: 'Receive push notifications in the browser',
		key: 'pushNotifications',
		label: 'Push notifications',
	},
	{
		description: 'Get alerts for security-related events',
		key: 'securityAlerts',
		label: 'Security alerts',
	},
	{
		description: 'Receive system status and maintenance alerts',
		key: 'systemAlerts',
		label: 'System alerts',
	},
	{
		description: 'Receive product updates and marketing emails',
		key: 'marketingEmails',
		label: 'Marketing emails',
	},
];

function NotificationPreferences({
	disabled,
	isLoading,
	onToggle,
	preferences,
}: {
	disabled: boolean;
	isLoading: boolean;
	onToggle: (key: keyof NotificationPrefs, checked: boolean) => void;
	preferences: NotificationPrefs | undefined;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Notifications</CardTitle>
				<CardDescription>Choose which notifications you want to receive</CardDescription>
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<ContentListSkeleton lineHeight="h-10" />
				) : (
					/*
					 * Bordered rows, the same treatment the Sidebar switch in the Layout card
					 * already wears. Bare `justify-between` rows on a full-width card left each
					 * label and the switch it belongs to over 1100px apart at 2250 with nothing
					 * tying them together — five near-identical toggles in one column and five
					 * near-identical labels in another. The border is what binds the pair; the row
					 * is also the label element, so the whole 1400px of it toggles the switch
					 * rather than only the 32px control at the far end.
					 */
					<div className="space-y-3">
						{preferenceItems.map((item) => (
							<label
								className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3"
								htmlFor={`pref-${item.key}`}
								key={item.key}>
								<span className="space-y-0.5">
									<span className="block text-sm font-medium">{item.label}</span>
									<span className="block text-xs text-muted-foreground">
										{item.description}
									</span>
								</span>
								<Switch
									checked={preferences?.[item.key] ?? false}
									disabled={disabled}
									id={`pref-${item.key}`}
									onCheckedChange={(checked) => onToggle(item.key, checked)}
								/>
							</label>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export { NotificationPreferences };
