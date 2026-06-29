import { type ColumnDef } from '@tanstack/react-table';
import { Download, FileText, Trash2 } from 'lucide-react';

import type { FileRecord } from '@/api/files';

import { Spinner } from '@/components/shared/Spinner';
import { Button } from '@/components/ui/button';
import { useFormatters } from '@/hooks/useFormatters';
import { formatBytes } from '@/lib/formatters';

interface UseFileColumnsOptions {
	canDelete: boolean;
	downloadingId: null | number;
	isActionDisabled: boolean;
	onDelete: (file: FileRecord) => void;
	onDownload: (id: number, fileName: string) => void;
}

function useFileColumns({
	canDelete,
	downloadingId,
	isActionDisabled,
	onDelete,
	onDownload,
}: UseFileColumnsOptions): ColumnDef<FileRecord>[] {
	const { formatDate } = useFormatters();

	const columns: ColumnDef<FileRecord>[] = [
		{
			accessorKey: 'originalName',
			cell: ({ row }) => (
				<div className="flex items-center">
					<FileText aria-hidden="true" className="text-muted-foreground mr-2 h-4 w-4" />
					<span className="min-w-0 truncate font-medium">
						{row.original.originalName}
					</span>
				</div>
			),
			header: 'Name',
		},
		{
			accessorKey: 'size',
			cell: ({ row }) => formatBytes(row.original.size),
			header: 'Size',
		},
		{
			accessorKey: 'mimeType',
			cell: ({ row }) => row.original.mimeType.split('/')[1] ?? 'file',
			header: 'Type',
		},
		{
			accessorKey: 'createdAt',
			cell: ({ row }) => formatDate(row.original.createdAt),
			header: 'Uploaded',
		},
		{
			cell: ({ row }) => (
				<div className="flex justify-end gap-1">
					<Button
						aria-label="Download file"
						className="h-8 w-8 p-0"
						disabled={isActionDisabled}
						onClick={() => void onDownload(row.original.id, row.original.originalName)}
						title="Download"
						variant="ghost">
						{downloadingId === row.original.id ? (
							<Spinner size={16} />
						) : (
							<Download className="h-4 w-4" />
						)}
					</Button>
					{canDelete && (
						<Button
							aria-label="Delete file"
							className="text-destructive h-8 w-8 p-0"
							disabled={isActionDisabled}
							onClick={() => onDelete(row.original)}
							title="Delete"
							variant="ghost">
							<Trash2 className="h-4 w-4" />
						</Button>
					)}
				</div>
			),
			header: '',
			id: 'actions',
		},
	];

	return columns;
}

export { useFileColumns };
