/**
 * Server-side pagination configuration for DataTable.
 *
 * When provided, the DataTable operates in server-side pagination mode where
 * the API is responsible for paginating data. The component receives pre-paginated
 * data and uses these callbacks to request different pages.
 */
interface DataTablePagination {
	limit: number;
	onPageChange: (page: number) => void;
	onPageSizeChange: (size: number) => void;
	page: number;
	total: number;
}

/**
 * Virtual scrolling configuration for DataTable.
 *
 * When enabled, replaces standard pagination with virtualized row rendering
 * for efficient display of large datasets (500+ rows).
 */
interface DataTableVirtualize {
	/** Height of the scrollable container in pixels (default: 400) */
	containerHeight?: number;
	/** Enable virtual scrolling */
	enabled: boolean;
	/** Number of rows rendered outside the visible area (default: 5) */
	overscan?: number;
	/** Fixed row height in pixels (default: 35) */
	rowHeight?: number;
}

export type { DataTablePagination, DataTableVirtualize };
