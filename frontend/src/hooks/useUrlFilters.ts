import { useSearchParams } from 'react-router-dom';

import { usePagination } from '@/hooks/usePagination';

/**
 * Combines URL-synced pagination with URL search parameter filters.
 *
 * Provides a `setFilter` callback that updates a URL param and resets
 * pagination to page 1 (so stale page offsets don't persist after filtering).
 *
 * @param pageSize  Default page size passed to `usePagination`.
 */
function useUrlFilters(pageSize = 20) {
	const pagination = usePagination(pageSize, true);
	const [searchParams, setSearchParams] = useSearchParams();

	/** Read a filter value from URL, falling back to `defaultValue`. */
	const getFilter = (key: string, defaultValue = '') => searchParams.get(key) ?? defaultValue;

	/**
	 * Set a URL filter parameter. Empty/default values delete the param.
	 * Automatically resets pagination to page 1.
	 */
	const setFilter = (key: string, value: string) => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				if (value) {
					next.set(key, value);
				} else {
					next.delete(key);
				}
				next.delete('page');
				return next;
			},
			{ replace: true }
		);
	};

	const setFilters = (
		update: (params: URLSearchParams) => void,
		options: { replace?: boolean } = { replace: true }
	) => {
		setSearchParams(
			(prev) => {
				const next = new URLSearchParams(prev);
				update(next);
				return next;
			},
			{ replace: options.replace ?? true }
		);
	};

	return { ...pagination, getFilter, searchParams, setFilter, setFilters };
}

export { useUrlFilters };
