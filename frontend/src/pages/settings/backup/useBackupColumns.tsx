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
				<span className="font-mono text-sm">{row.original.filename}</span>
			),
			header: 'Filename',
		},
		{
			accessorKey: 'timestamp',
			cell: ({ row }) => (
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
			header: () => <span className="block text-right">Size</span>,
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
						<DropdownMenuItem
							className="text-destructive"
							disabled={restoring}
							onClick={() => onRestore(row.original)}>
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
			size: 64,
		});
	}

	return columns;
}

export { useBackupColumns };
