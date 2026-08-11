import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SettingsToggleRow } from '../SettingsToggleRow';

interface FeatureToggleConfig {
	/** Only where the row carries a constraint the card header does not already state. */
	description?: string;
	key: string;
	label: string;
	settingKey: string;
}

/*
 * Labels are the navigation item's own name, not a sentence about it.
 *
 * Every row used to read "<Name> in navigation" over "Show the <Name> item in the navigation for
 * all users" — the phrase "in navigation" appeared thirteen times in one card whose header already
 * says "Control which items appear in the navigation", and six of the seven descriptions were one
 * sentence with a noun swapped. The three rows that genuinely differ — Analytics, Onboarding and
 * the bug report button — had their real constraint buried in that boilerplate. Now they are the
 * only rows with a description, so the distinction is what stands out instead of what is hidden.
 */
const FEATURE_TOGGLES: FeatureToggleConfig[] = [
	{ key: 'workspaces', label: 'Workspaces', settingKey: 'app.workspaces_enabled' },
	{ key: 'files', label: 'Files', settingKey: 'app.files_enabled' },
	{ key: 'dashboards', label: 'Custom Dashboards', settingKey: 'app.dashboards_enabled' },
	{
		description: 'Authorized users only',
		key: 'analytics',
		label: 'Analytics',
		settingKey: 'app.analytics_enabled',
	},
	{ key: 'notifications', label: 'Notifications', settingKey: 'app.notifications_enabled' },
	{
		description: 'Admin users only',
		key: 'onboarding',
		label: 'Onboarding',
		settingKey: 'app.onboarding_enabled',
	},
	{
		description: 'Shown in the header',
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
				{/*
				 * The commit model, stated before the interaction rather than after it. These seven
				 * switches change what every user of the installation sees, and the surface had no
				 * Save button, no footer and no dirty marker — nothing said whether a flip was live
				 * until a toast fired. Notification Retention already states its scope this way.
				 */}
				<CardDescription>
					Control which items appear in the navigation. Changes apply immediately for all
					users.
				</CardDescription>
			</CardHeader>
			{/*
			 * Two columns of `SettingsToggleRow`, not seven full-bleed bordered boxes.
			 *
			 * Each row used to be a `rounded-lg border p-4` box nested inside the card — card-in-card
			 * chrome that exists nowhere else in settings, drawn in the language the app uses for
			 * *clickable* cards while only the 32x18px Switch responded to the pointer. Stretched to
			 * the card width it left up to 1083px of dead space between a label and the control it
			 * belongs to, with no rule or column edge to bind them. The shared row (used by the
			 * sibling Notifications tab) drops the nested shell and restores the 12px description
			 * step; the two-column grid is the one /profile/preferences uses for the same job and
			 * halves both the label-to-switch distance and the card's height.
			 */}
			<CardContent>
				<div className="grid gap-4 sm:grid-cols-2">
					{FEATURE_TOGGLES.map((toggle) => (
						<SettingsToggleRow
							checked={features[toggle.key] ?? true}
							disabled={pending}
							id={toggle.key}
							key={toggle.key}
							label={toggle.label}
							onCheckedChange={(checked) => onFeatureChange(toggle.key, checked)}
							{...(toggle.description ? { description: toggle.description } : {})}
						/>
					))}
				</div>
			</CardContent>
		</Card>
	);
}

export { FEATURE_TOGGLES, FeatureFlagsSection };
export type { FeatureToggleConfig };
