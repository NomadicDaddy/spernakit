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
 * says where these items appear, and six of the seven descriptions were one
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
				{/*
				 * "Interface", not "Navigation". Six of the seven toggles are navigation items;
				 * the seventh is the bug report button, which carried its own contradicting
				 * helper line — "Shown in the header" — and sat alone in the fourth grid row.
				 * The one control the header did not describe was also the one the layout
				 * singled out. Widening the framing is the smaller fix than splitting a
				 * seven-row card into a six-row card and a one-row card.
				 */}
				<CardTitle>Interface Features</CardTitle>
				{/*
				 * The commit model, stated before the interaction rather than after it. These seven
				 * switches change what every user of the installation sees, and the surface had no
				 * Save button, no footer and no dirty marker — nothing said whether a flip was live
				 * until a toast fired. Notification Retention already states its scope this way.
				 */}
				<CardDescription>
					Control which items appear in the navigation and header. Changes apply
					immediately for all users.
				</CardDescription>
			</CardHeader>
			{/*
			 * Two columns of `SettingsToggleRow`, not seven full-bleed boxes.
			 *
			 * Each row used to carry its own hand-rolled `rounded-lg border p-4` shell, stretched to
			 * the card width: up to 1083px of dead space between a label and the control it belongs
			 * to, drawn in the language the app uses for *clickable* cards while only the 32x18px
			 * Switch responded to the pointer. The shared row is bordered too, but the border is
			 * earned — the row is a `<label>`, so all of it toggles the switch. What this grid fixes
			 * is the width: two columns is what /profile/preferences uses for the same job, and it
			 * halves both the label-to-switch distance and the card's height.
			 */}
			<CardContent>
				<div className="grid gap-3 sm:grid-cols-2">
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
