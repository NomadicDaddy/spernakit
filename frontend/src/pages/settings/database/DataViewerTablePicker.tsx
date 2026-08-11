import { Label } from '@/components/ui/label';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';

interface DataViewerTablePickerProps {
	onSelect: (tableName: string) => void;
	/** Every table the operator may browse, in schema order. */
	tableNames: string[];
	/** Omitted when no table is selected yet, which is what puts the trigger in placeholder state. */
	value?: string | undefined;
}

/**
 * The single control that chooses which table the Data Viewer is showing.
 *
 * It exists once and renders in two places — the empty state and the toolbar — because having it
 * only in the empty state made choosing a table a one-way door. The panel is addressed by a `table`
 * query parameter, so the operator could reach any table by editing the URL, but the only control
 * that set it disappeared the moment it was used, and the way back was to leave for the Schema tab
 * and come in again.
 *
 * In the toolbar it replaces a static `h3` that named the current table without being able to change
 * it, so the strip keeps naming what is on screen and gains the ability to act on it.
 */
function DataViewerTablePicker({ onSelect, tableNames, value }: DataViewerTablePickerProps) {
	return (
		<div className="flex items-center gap-2">
			<Label className="text-sm" htmlFor="data-viewer-table">
				Table
			</Label>
			<Select onValueChange={onSelect} {...(value ? { value } : {})}>
				<SelectTrigger className="w-56" id="data-viewer-table">
					<SelectValue placeholder="Choose a table…" />
				</SelectTrigger>
				<SelectContent className="max-h-80">
					{tableNames.map((name) => (
						<SelectItem key={name} value={name}>
							{name}
						</SelectItem>
					))}
				</SelectContent>
			</Select>
		</div>
	);
}

export { DataViewerTablePicker };
