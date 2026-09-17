import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { SettingsToggleRow } from '../SettingsToggleRow';
import { FEATURE_TOGGLES } from './featureToggles';

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
			 *
			 * `max-w-4xl`, not the `max-w-2xl` the one-column settings sections cap their stacks at.
			 * The cap exists to bound the row, not the container, and two columns need twice the
			 * measure to land a row at the same width — 4xl gives 442px rows against 2xl's 624px in a
			 * single column, where 2xl here would give 330px and start wrapping the descriptions.
			 * Uncapped the rows ran 705px at 2560, which is the number two columns were meant to fix.
			 */}
			<CardContent>
				<div className="grid max-w-4xl gap-3 sm:grid-cols-2">
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

export { FeatureFlagsSection };
