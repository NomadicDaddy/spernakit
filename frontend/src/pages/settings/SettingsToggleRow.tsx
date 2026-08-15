import { Switch } from '@/components/ui/switch';

interface SettingsToggleRowProps {
	checked: boolean;
	description?: string;
	disabled?: boolean;
	id: string;
	label: string;
	onCheckedChange: (checked: boolean) => void;
}

/**
 * One labelled switch, used for every toggle in Settings.
 *
 * The row is the label, in the shape /profile/preferences already uses for the same job. Before
 * this it was a bare `justify-between` div: the only pointer targets were an ~83x14px label and
 * the 32px switch at the far end, with 347–672px of dead space between them and nothing binding
 * the pair — at 390px wide only 27.7% of the row responded to a tap. A `<label htmlFor>` wrapper
 * makes the whole row the hit target and the border makes that target visible, which is the part
 * the switch's own 24px `::before` expander could never do.
 *
 * `max-w-2xl` went with it. The cap existed only to shorten that unbound label-to-switch traverse;
 * the border does the same job at any width, which is why the exemplar runs its rows to the full
 * card width with no cap.
 *
 * The text stack is spans, not a `<Label>` over a `<p>`. A `<label>` nested in a `<label>` is
 * invalid, and `<label>` takes phrasing content, so `block` spans carry the type styles the Label
 * component was supplying.
 */
export function SettingsToggleRow({
	checked,
	description,
	disabled,
	id,
	label,
	onCheckedChange,
}: SettingsToggleRowProps) {
	return (
		<label
			/*
			 * Settings toggles spend real time disabled — every one of them is disabled while its
			 * card is loading or saving. Now that the whole row is the target, a row-wide
			 * `cursor-pointer` over a switch that will not move is the row claiming to be live, so
			 * the cursor follows the control's state.
			 */
			className="flex cursor-pointer items-center justify-between gap-4 rounded-lg border p-3 has-[button:disabled]:cursor-not-allowed"
			htmlFor={id}>
			<span className="space-y-0.5">
				<span className="block text-sm font-medium">{label}</span>
				{description && (
					<span className="block text-xs text-muted-foreground">{description}</span>
				)}
			</span>
			<Switch
				checked={checked}
				disabled={disabled}
				id={id}
				onCheckedChange={onCheckedChange}
			/>
		</label>
	);
}
