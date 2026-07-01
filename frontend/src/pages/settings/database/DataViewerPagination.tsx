import { Button } from '@/components/ui/button';

interface DataViewerPaginationProps {
	onPageChange: (page: number) => void;
	page: number;
	total: number;
	totalPages: number;
}

function DataViewerPagination({
	onPageChange,
	page,
	total,
	totalPages,
}: DataViewerPaginationProps) {
	if (totalPages <= 1) return null;

	return (
		<div className="flex items-center justify-between text-sm">
			<span className="text-muted-foreground">
				Page {page} of {totalPages} ({total} rows)
			</span>
			<div className="flex gap-2">
				<Button
					disabled={page <= 1}
					onClick={() => onPageChange(page - 1)}
					size="sm"
					variant="outline">
					Previous
				</Button>
				<Button
					disabled={page >= totalPages}
					onClick={() => onPageChange(page + 1)}
					size="sm"
					variant="outline">
					Next
				</Button>
			</div>
		</div>
	);
}

export { DataViewerPagination };
