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

/** Compact button group for selecting a time range. */
function TimeRangeSelector({ onChange, value }: TimeRangeSelectorProps) {
	return (
		<div className="flex gap-1">
			{TIME_RANGES.map((range) => (
				<Button
					key={range.hours}
					onClick={() => onChange(range.hours)}
					size="sm"
					variant={value === range.hours ? 'default' : 'outline'}>
					{range.label}
				</Button>
			))}
		</div>
	);
}

export { TimeRangeSelector };
export type { TimeRangeSelectorProps };
