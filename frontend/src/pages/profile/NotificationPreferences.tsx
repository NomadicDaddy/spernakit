import type { NotificationPreferences as NotificationPrefs } from '@/api/notifications';

import { ContentListSkeleton } from '@/components/shared/skeletons/ContentListSkeleton';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
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
					<div className="space-y-4">
						{preferenceItems.map((item) => (
							<div className="flex items-center justify-between" key={item.key}>
								<div className="space-y-0.5">
									<Label htmlFor={`pref-${item.key}`}>{item.label}</Label>
									<p className="text-muted-foreground text-xs">
										{item.description}
									</p>
								</div>
								<Switch
									checked={preferences?.[item.key] ?? false}
									disabled={disabled}
									id={`pref-${item.key}`}
									onCheckedChange={(checked) => onToggle(item.key, checked)}
								/>
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	);
}

export { NotificationPreferences };
