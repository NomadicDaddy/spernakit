/** The toggles the notification settings tab renders, with their setting keys and defaults. */
export interface ToggleConfig {
	description?: string;
	fallback: boolean;
	id: string;
	key: string;
	label: string;
	toastLabel: string;
}

export const DELIVERY_TOGGLES: ToggleConfig[] = [
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
export const DEFAULT_PREF_TOGGLES: ToggleConfig[] = [
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
