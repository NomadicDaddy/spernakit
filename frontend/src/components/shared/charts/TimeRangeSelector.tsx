import { OptionCardGroup } from '@/components/shared/OptionCardGroup';
import { Button } from '@/components/ui/button';

interface TimeRange {
	hours: number;
	label: string;
}

const TIME_RANGES: TimeRange[] = [
	{ hours: 1, label: '1h' },
	{ hours: 6, label: '6h' },
	{ hours: 12, label: '12h' },
	{ hours: 24, label: '24h' },
];

interface TimeRangeSelectorProps {
	/** Callback when a time range is selected */
	onChange: (hours: number) => void;
	/** Currently selected hours value */
	value: number;
}

/**
 * Compact button group for selecting a time range.
 *
 * Four buttons carrying `aria-pressed` announced four independent toggles that happened to be next
 * to each other — nothing said they are mutually exclusive, that they form one control, or that
 * "6h" is 2 of 4. It is the same defect `OptionCard` was fixed for, so it reuses the same group:
 * `OptionCardGroup` supplies the `radiogroup`, the arrow-key movement the role promises and the
 * single tabstop, while these stay `Button` pills rather than `OptionCard` tiles because they sit
 * in a chart header where a 3-line tile would not fit.
 */
function TimeRangeSelector({ onChange, value }: TimeRangeSelectorProps) {
	return (
		<OptionCardGroup className="flex gap-1" label="Time range">
			{TIME_RANGES.map((range) => (
				<Button
					aria-checked={value === range.hours}
					key={range.hours}
					onClick={() => onChange(range.hours)}
					role="radio"
					size="sm"
					tabIndex={value === range.hours ? 0 : -1}
					variant={value === range.hours ? 'default' : 'outline'}>
					{range.label}
				</Button>
			))}
		</OptionCardGroup>
	);
}

export { TimeRangeSelector };
export type { TimeRangeSelectorProps };
