import { type ColumnDef } from '@tanstack/react-table';
import { MoreHorizontal, RotateCcw } from 'lucide-react';

import type { BackupFile } from '@/api/backup';
import type { DataTableFeatures } from '@/components/shared/data-table/features';

import { Button } from '@/components/ui/button';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useFormatters } from '@/hooks/useFormatters';
import { formatBytes } from '@/lib/formatters';

interface BackupColumnsProps {
	/** SYSOP only. Without it the actions column is omitted rather than rendered disabled. */
	canRestore: boolean;
	onRestore: (backup: BackupFile) => void;
	restoring: boolean;
}

/**
 * Columns for the backup inventory, mirroring `useUserColumns` and `useScheduledTaskColumns`.
 *
 * The inventory used to be a bespoke list of bordered `div` rows: no headers, no sort, no search,
 * a hand-written pager, and the three facts per row run together as a filename plus one muted
 * sentence (`08/09/2026 16:29 — 536.04 KB`), so sixteen identical sizes could not be read as a
 * column. Filename, Created and Size are columns now, and the row's two anchors — filename hard
 * left, Restore hard right, 947px of nothing between them at 1920 — become four tracks.
 */
function useBackupColumns({ canRestore, onRestore, restoring }: BackupColumnsProps) {
	const { formatDateTime } = useFormatters();

	const columns: ColumnDef<DataTableFeatures, BackupFile, unknown>[] = [
		{
			accessorKey: 'filename',
			cell: ({ row }) => (
				// Monospace: these names are timestamps in disguise
				// (`spernakit.2026-08-09T21-29-45.backup.db.enc`), and a fixed advance is what lets
				// sixteen of them be compared down the column.
				//
				/*
				 * Below `sm` it wraps rather than truncating. A pinned column needs a bounded
				 * width, and the part of this name that distinguishes one row from another is the
				 * timestamp at the END — an ellipsis would remove exactly the characters the reader
				 * came for. `break-all` because there is no space to break at.
				 *
				 * The `min-w` floor is what makes the bound a floor and not a collapse: `break-all`
				 * drops the cell's min-content size to a single character, and under `table-layout:
				 * auto` the browser then shrank this column to 70px and wrapped a 43-character
				 * filename over six lines. `size: 180` below is only a preference and does not
				 * prevent that. From `sm` the column goes back to one nowrap line, which is what
				 * makes sixteen of these comparable down the column on a desktop.
				 *
				 * 128px, not more, because this column is pinned and a pinned column is width the
				 * scroller never gets back. At 150px the two pins left a 67.5px window at 360, and
				 * `560.04 KB` scrolled under the pin as `60.04 KB` at every scroll position — a
				 * clipped number that reads as a valid smaller one, which is worse than a clipped
				 * word. 128px leaves both middle columns able to clear the pins.
				 */
				<span className="block min-w-[128px] font-mono text-sm break-all whitespace-normal sm:min-w-0 sm:whitespace-nowrap">
					{row.original.filename}
				</span>
			),
			header: 'Filename',
			/*
			 * Pinned. This table is 2-3x the width of its card at 390px, and a restore is chosen by
			 * reading the filename and then acting on the Actions menu at the far right — two ends
			 * of a scroller that could not both be on screen. Restoring the wrong backup is the cost
			 * of losing track of the row in between. See data-table/stickyColumns.ts.
			 */
			meta: { sticky: 'left' },
			size: 180,
		},
		{
			accessorKey: 'timestamp',
			cell: ({ row }) => (
				/*
				 * At 360px this column is 142px and the window between the two pinned columns is
				 * 89px, so it cannot be read in full at any scroll position. That is deliberate
				 * rather than unnoticed: it is the one column whose content is already spelled out
				 * in the pinned cell beside it, because a backup's filename IS its timestamp
				 * (`spernakit.2026-08-15T09-16-30.backup.db.enc`). Wrapping it does not shrink it —
				 * a table inside a horizontal scroller is under no pressure to narrow — and the
				 * only column that had to clear the pins is Size, where a clipped `560.04 KB`
				 * reads as a valid `60.04 KB`.
				 */
				<span className="text-sm whitespace-nowrap text-muted-foreground">
					{formatDateTime(row.original.timestamp)}
				</span>
			),
			header: 'Created',
			size: 170,
		},
		{
			accessorKey: 'sizeBytes',
			cell: ({ row }) => (
				<span className="block text-right text-sm text-muted-foreground tabular-nums">
					{formatBytes(row.original.sizeBytes)}
				</span>
			),
			header: 'Size',
			// The alignment moved from a JSX `header` to `meta` so the shared header cell can honour
			// it. A sort button hugs its own text, so a right-aligned span nested inside one no
			// longer reaches the right edge of the column; the header cell needs to know before it
			// decides how to lay the button out. `sizeBytes` is the raw number, so sorting orders by
			// size rather than by the formatted string, where "9.8 KB" would follow "560.04 KB".
			meta: { headerAlign: 'right' },
			size: 110,
		},
	];

	if (canRestore) {
		columns.push({
			cell: ({ row }) => (
				/*
				 * Restore is behind the row-action menu, not on the row.
				 *
				 * Sixteen always-visible `variant="outline"` buttons gave irreversible database
				 * replacement exactly the weight this component gave its own Previous/Next pager,
				 * and all sixteen exposed the accessible name "Restore" and nothing else — a
				 * screen-reader operator tabbing the most destructive surface in the app could not
				 * tell which database version they were about to write over. The trigger names its
				 * file and the item is the destructive one in the menu.
				 */
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<Button
							aria-label={`Actions for backup ${row.original.filename}`}
							size="icon"
							variant="ghost">
							<MoreHorizontal aria-hidden="true" className="size-4" />
						</Button>
					</DropdownMenuTrigger>
					<DropdownMenuContent align="end">
						{/*
						 * `variant`, not `className="text-destructive"`. The class loses to
						 * DropdownMenuItem's own `focus:text-accent-foreground`, so the label went
						 * near-white on a neutral ground at exactly the moment the operator is
						 * committed to clicking — and the icon never turned red at all. The variant
						 * branch supplies all three: destructive text, a destructive focus ground,
						 * and a destructive icon.
						 */}
						<DropdownMenuItem
							disabled={restoring}
							onClick={() => onRestore(row.original)}
							variant="destructive">
							<RotateCcw aria-hidden="true" className="size-4" />
							Restore this backup
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			),
			enableHiding: false,
			enableSorting: false,
			header: 'Actions',
			id: 'actions',
			// The other half of the pin — see the Filename column above.
			meta: { sticky: 'right' },
			size: 64,
		});
	}

	return columns;
}

export { useBackupColumns };
