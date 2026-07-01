import { Checkbox } from '@/components/ui/checkbox';
import { stringifyValue } from '@/lib/tableExport';
import { CELL_TRUNCATION_LENGTH } from '@/lib/validation';

function CellValue({ value }: { value: unknown }) {
	if (value === null || value === undefined) {
		return <span className="text-muted-foreground italic">null</span>;
	}
	if (typeof value === 'boolean') {
		return <Checkbox checked={value} disabled />;
	}
	const str = stringifyValue(value);
	if (str.length > CELL_TRUNCATION_LENGTH) {
		return <span title={str}>{str.substring(0, CELL_TRUNCATION_LENGTH)}…</span>;
	}
	return <span>{str}</span>;
}

export { CellValue };
