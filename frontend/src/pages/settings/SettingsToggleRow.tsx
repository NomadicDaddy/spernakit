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

export function SettingsToggleRow({
	checked,
	description,
	disabled,
	id,
	label,
	onCheckedChange,
}: SettingsToggleRowProps) {
	return (
		<div className="flex items-center justify-between">
			<div className="space-y-0.5">
				<Label htmlFor={id}>{label}</Label>
				{description && <p className="text-muted-foreground text-xs">{description}</p>}
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
