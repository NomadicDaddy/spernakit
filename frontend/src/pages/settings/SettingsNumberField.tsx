import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface SettingsNumberFieldProps {
	/** Sentence under the input — the current value's meaning, or the accepted range. */
	hint: string;
	id: string;
	label: string;
	max: number;
	min: number;
	onChange: (value: string) => void;
	value: string;
}

/**
 * A labelled numeric setting.
 *
 * The auth policy form declared this block five times over three files, each with its own
 * `max-w-xs` on the input — a hard 320px cap that left 71% of a 1094px row empty at 1440 and 77% of
 * a 1422px row at 2250, to hold one or two digits. The cap is gone: width now comes from the grid
 * cell the field is placed in, so pairing two fields in a `sm:grid-cols-2` row is what sizes them,
 * and the same fields no longer stack one-per-row into 1.85 screens of scroll.
 */
function SettingsNumberField({
	hint,
	id,
	label,
	max,
	min,
	onChange,
	value,
}: SettingsNumberFieldProps) {
	return (
		<div className="space-y-2">
			<Label htmlFor={id}>{label}</Label>
			<Input
				autoComplete="off"
				id={id}
				inputMode="numeric"
				max={max}
				min={min}
				onChange={(e) => onChange(e.target.value)}
				type="number"
				value={value}
			/>
			<p className="text-xs text-muted-foreground">{hint}</p>
		</div>
	);
}

export { SettingsNumberField };
