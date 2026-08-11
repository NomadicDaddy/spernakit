import { Label } from '@/components/ui/label';
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
 * `max-w-2xl` is the point of the row. `justify-between` pins the Switch to the far edge of
 * whatever contains it, so in a full-width settings card the measured distance from the end of a
 * label to the control it belongs to ran 426–703px at 1440 and up to 1031px at 2250 — with no
 * zebra, leader rule or column edge to bind the two, reading "which of these is off" was a
 * full-width eye traverse per row. Capping the row caps the traverse at roughly 600px at any
 * viewport and keeps the switches in one column, which is what makes the set scannable.
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
		<div className="flex max-w-2xl items-center justify-between gap-6">
			<div className="space-y-0.5">
				<Label htmlFor={id}>{label}</Label>
				{description && <p className="text-xs text-muted-foreground">{description}</p>}
			</div>
			<Switch
				checked={checked}
				disabled={disabled}
				id={id}
				onCheckedChange={onCheckedChange}
			/>
		</div>
	);
}
