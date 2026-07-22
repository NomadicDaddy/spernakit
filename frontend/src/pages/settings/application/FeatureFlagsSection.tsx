import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface FeatureToggleConfig {
	description: string;
	key: string;
	label: string;
	settingKey: string;
}

const FEATURE_TOGGLES: FeatureToggleConfig[] = [
	{
		description: 'Show the Workspaces item in the navigation for all users',
		key: 'workspaces',
		label: 'Workspaces in navigation',
		settingKey: 'app.workspaces_enabled',
	},
	{
		description: 'Show the Files item in the navigation for all users',
		key: 'files',
		label: 'Files in navigation',
		settingKey: 'app.files_enabled',
	},
	{
		description: 'Show the Custom Dashboards item in the navigation for all users',
		key: 'dashboards',
		label: 'Custom Dashboards in navigation',
		settingKey: 'app.dashboards_enabled',
	},
	{
		description: 'Show the Analytics item in the navigation for authorized users',
		key: 'analytics',
		label: 'Analytics in navigation',
		settingKey: 'app.analytics_enabled',
	},
	{
		description: 'Show the Notifications item in the navigation for all users',
		key: 'notifications',
		label: 'Notifications in navigation',
		settingKey: 'app.notifications_enabled',
	},
	{
		description: 'Show the Onboarding page for admin users',
		key: 'onboarding',
		label: 'Onboarding in navigation',
		settingKey: 'app.onboarding_enabled',
	},
	{
		description: 'Show the bug report button in the header',
		key: 'bugReport',
		label: 'Bug report button',
		settingKey: 'app.bug_report_enabled',
	},
];

interface FeatureFlagsSectionProps {
	features: Record<string, boolean>;
	onFeatureChange: (key: string, value: boolean) => void;
	pending: boolean;
}

function FeatureFlagsSection({ features, onFeatureChange, pending }: FeatureFlagsSectionProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Navigation Features</CardTitle>
				<CardDescription>Control which items appear in the navigation</CardDescription>
			</CardHeader>
			<CardContent className="space-y-6">
				{FEATURE_TOGGLES.map((toggle) => (
					<div
						className="flex flex-row items-center justify-between rounded-lg border p-4"
						key={toggle.key}>
						<div className="space-y-0.5">
							<Label htmlFor={toggle.key}>{toggle.label}</Label>
							<p className="text-muted-foreground text-sm">{toggle.description}</p>
						</div>
						<Switch
							checked={features[toggle.key] ?? true}
							disabled={pending}
							id={toggle.key}
							onCheckedChange={(checked) => onFeatureChange(toggle.key, checked)}
						/>
					</div>
				))}
			</CardContent>
		</Card>
	);
}

export { FEATURE_TOGGLES, FeatureFlagsSection };
export type { FeatureToggleConfig };
